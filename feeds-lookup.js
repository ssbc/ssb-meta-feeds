const { seekKey } = require('bipf')
const pull = require('pull-stream')
const SSBURI = require('ssb-uri2')
const DeferredPromise = require('p-defer')
const {
  where,
  and,
  isPublic,
  live,
  equal,
  authorIsBendyButtV1,
  toPullStream,
  toCallback,
} = require('ssb-db2/operators')
const validate = require('./validate')

const SUBFEED_PREFIX_OFFSET = Math.max(
  '@'.length,
  'ssb:feed/bendybutt-v1/'.length,
  'ssb:feed/gabbygrove-v1/'.length
)

const B_VALUE = Buffer.from('value')
const B_CONTENT = Buffer.from('content')
const B_SUBFEED = Buffer.from('subfeed')

function seekSubfeed(buffer) {
  let p = 0 // note you pass in p!
  p = seekKey(buffer, p, B_VALUE)
  if (p < 0) return
  p = seekKey(buffer, p, B_CONTENT)
  if (p < 0) return
  return seekKey(buffer, p, B_SUBFEED)
}

function subfeed(feedId) {
  return equal(seekSubfeed, feedId, {
    prefix: 32,
    prefixOffset: SUBFEED_PREFIX_OFFSET,
    indexType: 'value_content_subfeed',
  })
}

exports.init = function (sbot, config) {
  let stateLoaded = false
  const stateLoadedP = DeferredPromise()
  let loadStateRequested = false
  let liveDrainer = null
  const lookup = new Map() // feedId => details
  const ensureQueue = {
    _map: new Map(), // feedId => Array<Callback>
    add(feedId, cb) {
      if (this._map.has(feedId)) this._map.get(feedId).push(cb)
      else this._map.set(feedId, [cb])
    },
    flush(feedId) {
      const queue = this._map.get(feedId)
      this._map.delete(feedId)
      while (queue && queue.length > 0) {
        const cb = queue.shift()
        stateLoadedP.promise.then(cb)
      }
    },
  }

  function assertFeedId(feedId) {
    if (!feedId) {
      throw new Error('feedId should be provided')
    }
    if (typeof feedId !== 'string') {
      throw new Error('feedId should be a string, but got ' + feedId)
    }
  }

  function detectFeedFormat(feedId) {
    if (feedId.startsWith('@')) {
      return 'ed25519'
    } else if (SSBURI.isBendyButtV1FeedSSBURI(feedId)) {
      return 'bendybutt-v1'
    } else {
      throw new Error('Invalid feed format: ' + feedId)
    }
  }

  function msgToDetails(msg) {
    const content = msg.value.content
    const details = {}
    details.feedformat = detectFeedFormat(content.subfeed)
    details.feedpurpose = content.feedpurpose
    details.metafeed = content.metafeed
    const metadata = {}
    const NOT_METADATA = [
      'metafeed',
      'feedpurpose',
      'type',
      'tangles',
      'subfeed',
      'nonce',
    ]
    const keys = Object.keys(content).filter((k) => !NOT_METADATA.includes(k))
    for (const key of keys) {
      metadata[key] = content[key]
    }
    details.metadata = metadata
    return details
  }

  function updateLookup(msg) {
    const { type, subfeed } = msg.value.content
    if (type.startsWith('metafeed/add/')) {
      lookup.set(subfeed, msgToDetails(msg))
      ensureQueue.flush(subfeed)
    } else if (type === 'metafeed/tombstone') {
      lookup.delete(subfeed)
      ensureQueue.flush(subfeed)
    }
  }

  function loadState() {
    pull(
      sbot.db.query(
        where(and(authorIsBendyButtV1(), isPublic())),
        toPullStream()
      ),
      pull.filter((msg) => validate.isValid(msg)),
      pull.drain(updateLookup, (err) => {
        if (err) return cb(err)

        stateLoaded = true
        stateLoadedP.resolve()

        sbot.close.hook(function (fn, args) {
          if (liveDrainer) liveDrainer.abort()
          fn.apply(this, args)
        })

        pull(
          sbot.db.query(
            where(and(authorIsBendyButtV1(), isPublic())),
            live(),
            toPullStream()
          ),
          pull.filter((msg) => validate.isValid(msg)),
          (liveDrainer = pull.drain(updateLookup))
        )
      })
    )
  }

  return {
    loadState(cb) {
      if (!loadStateRequested) {
        loadStateRequested = true
        loadState()
      }
      if (cb) stateLoadedP.promise.then(cb)
    },

    ensureLoaded(feedId, cb) {
      if (!loadStateRequested) loadState()

      if (lookup.has(feedId)) cb()
      else ensureQueue.add(feedId, cb)
    },

    findByIdSync(feedId) {
      if (!stateLoaded) {
        throw new Error('Please call loadState() before using findByIdSync()')
      }
      assertFeedId(feedId)

      return lookup.get(feedId)
    },

    findById(feedId, cb) {
      try {
        assertFeedId(feedId)
        detectFeedFormat(feedId)
      } catch (err) {
        return cb(err)
      }

      sbot.db.query(
        where(subfeed(feedId)),
        toCallback((err, msgs) => {
          if (err) return cb(err)

          msgs = msgs.filter((msg) => validate.isValid(msg))
          if (msgs.find((m) => m.value.content.type === 'metafeed/tombstone')) {
            return cb(null, null)
          }
          msgs = msgs.filter((m) =>
            m.value.content.type.startsWith('metafeed/add/')
          )
          if (msgs.length === 0) {
            return cb(null, null)
          }

          const details = msgToDetails(msgs[0])
          cb(null, details)
        })
      )
    },
  }
}
