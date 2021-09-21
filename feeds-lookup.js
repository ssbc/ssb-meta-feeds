const { seekKey } = require('bipf')
const pull = require('pull-stream')
const cat = require('pull-cat')
const Notify = require('pull-notify')
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
  let notifyNewBranch = null
  const detailsLookup = new Map() // feedId => details
  const childrenLookup = new Map() // feedId => Set<FeedID>
  const roots = new Set()
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
      return 'classic'
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
    const { type, subfeed, metafeed } = msg.value.content

    // Update roots
    if (!detailsLookup.has(metafeed)) {
      detailsLookup.set(metafeed, null)
      roots.add(metafeed)
    }

    // Update children
    if (childrenLookup.has(metafeed)) {
      const subfeeds = childrenLookup.get(metafeed)
      if (type.startsWith('metafeed/add/')) {
        subfeeds.add(subfeed)
      } else if (type === 'metafeed/tombstone') {
        subfeeds.delete(subfeed)
        if (subfeeds.size === 0) {
          childrenLookup.delete(metafeed)
        }
      }
    } else {
      if (type.startsWith('metafeed/add/')) {
        const subfeeds = new Set()
        subfeeds.add(subfeed)
        childrenLookup.set(metafeed, subfeeds)
      }
    }

    // Update details
    if (type.startsWith('metafeed/add/')) {
      detailsLookup.set(subfeed, msgToDetails(msg))
      roots.delete(subfeed)
      ensureQueue.flush(subfeed)
    } else if (type === 'metafeed/tombstone') {
      detailsLookup.delete(subfeed)
      roots.delete(subfeed)
      ensureQueue.flush(subfeed)
    }

    if (notifyNewBranch) notifyNewBranch(makeBranch(subfeed))
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
        notifyNewBranch = Notify()

        sbot.close.hook(function (fn, args) {
          if (liveDrainer) liveDrainer.abort(true)
          if (notifyNewBranch) notifyNewBranch.abort(true)
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

  function makeBranch(subfeed) {
    const details = detailsLookup.get(subfeed)
    const branch = [[subfeed, details]]
    while (branch[0][1]) {
      const metafeedId = branch[0][1].metafeed
      const details = detailsLookup.get(metafeedId) || null
      branch.unshift([metafeedId, details])
    }
    return branch
  }

  function traverseBranchesUnder(feedId, previousBranch, visit) {
    const details = detailsLookup.get(feedId) || null
    const branch = [...previousBranch, [feedId, details]]
    visit(branch)
    if (childrenLookup.has(feedId)) {
      for (const childFeedId of childrenLookup.get(feedId)) {
        traverseBranchesUnder(childFeedId, branch, visit)
      }
    }
  }

  function branchStreamOld() {
    const branches = []
    for (const rootMetafeedId of roots) {
      traverseBranchesUnder(rootMetafeedId, [], (branch) => {
        branches.push(branch)
      })
    }
    return pull.values(branches)
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

      if (detailsLookup.has(feedId)) cb()
      else ensureQueue.add(feedId, cb)
    },

    findByIdSync(feedId) {
      if (!stateLoaded) {
        throw new Error('Please call loadState() before using findByIdSync()')
      }
      assertFeedId(feedId)

      return detailsLookup.get(feedId)
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

    branchStream(opts) {
      if (!notifyNewBranch) return pull.empty()
      const { live = true, old = false, root = null } = opts || {}
      const filterFn = root
        ? (branch) => branch.length > 0 && branch[0][0] === root
        : () => true

      if (old && live) {
        return pull(
          cat([branchStreamOld(), notifyNewBranch.listen()]),
          pull.filter(filterFn)
        )
      } else if (live) {
        return pull(notifyNewBranch.listen(), pull.filter(filterFn))
      } else if (old) {
        return pull(branchStreamOld(), pull.filter(filterFn))
      } else {
        return pull.empty()
      }
    },
  }
}
