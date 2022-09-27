// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const { seekKey } = require('bipf')
const pull = require('pull-stream')
const cat = require('pull-cat')
const Notify = require('pull-notify')
const Defer = require('pull-defer')
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
  'ssb:feed/indexed-v1/'.length,
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

  function msgToDetails(prevDetails, msg) {
    const content = msg.value.content
    const details = { ...prevDetails }
    details.feedformat = validate.detectFeedFormat(content.subfeed)
    details.feedpurpose = content.feedpurpose || details.feedpurpose
    details.metafeed = content.metafeed || details.metafeed
    details.metadata = {} || details.metafeed
    const NOT_METADATA = [
      'metafeed',
      'feedpurpose',
      'type',
      'tangles',
      'reason',
      'subfeed',
      'nonce',
    ]
    const keys = Object.keys(content).filter((k) => !NOT_METADATA.includes(k))
    for (const key of keys) {
      details.metadata[key] = content[key]
    }
    if (content.type === 'metafeed/tombstone') {
      details.tombstoned = true
      details.reason = content.reason
    }
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
    if (type.startsWith('metafeed/add/')) {
      if (childrenLookup.has(metafeed)) {
        const subfeeds = childrenLookup.get(metafeed)
        subfeeds.add(subfeed)
      } else {
        const subfeeds = new Set()
        subfeeds.add(subfeed)
        childrenLookup.set(metafeed, subfeeds)
      }
    }

    // Update details
    const details = msgToDetails(detailsLookup.get(subfeed), msg)
    detailsLookup.set(subfeed, details)
    roots.delete(subfeed)
    ensureQueue.flush(subfeed)

    if (notifyNewBranch) notifyNewBranch(makeBranch(subfeed))
  }

  function loadState() {
    loadStateRequested = true
    notifyNewBranch = Notify()

    pull(
      sbot.db.query(
        where(and(authorIsBendyButtV1(), isPublic())),
        toPullStream()
      ),
      pull.filter((msg) => validate.isValid(msg)),
      pull.drain(updateLookup, (err) => {
        if (err) return console.error(err)

        stateLoadedP.resolve()

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

  function branchStreamOld(rootMetafeedId) {
    const branches = []
    if (rootMetafeedId) {
      traverseBranchesUnder(rootMetafeedId, [], (branch) => {
        branches.push(branch)
      })
    } else {
      for (const rootMetafeedId of roots) {
        traverseBranchesUnder(rootMetafeedId, [], (branch) => {
          branches.push(branch)
        })
      }
    }
    return pull.values(branches)
  }

  function branchStreamLive(rootMetafeedId) {
    if (rootMetafeedId) {
      return pull(
        notifyNewBranch.listen(),
        pull.map(function cutBranch(branch) {
          const idx = branch.findIndex(([feedId]) => feedId === rootMetafeedId)
          if (idx < 0) return []
          else if (idx === 0) return branch
          else return branch.slice(idx)
        }),
        pull.filter(function hasRoot(branch) {
          return branch.length > 0 && branch[0][0] === rootMetafeedId
        })
      )
    } else {
      return notifyNewBranch.listen()
    }
  }

  function findById(feedId, cb) {
    try {
      assertFeedId(feedId)
      if (!validate.detectFeedFormat(feedId)) throw Error('Invalid feedId')
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

        const details = msgToDetails(undefined, msgs[0])
        cb(null, details)
      })
    )
  }

  function branchStream(opts) {
    if (!loadStateRequested) {
      loadState()
      const deferred = Defer.source()
      stateLoadedP.promise.then(() => {
        deferred.resolve(branchStream(opts))
      })
      return deferred
    }

    const {
      live = true,
      old = false,
      root = null,
      tombstoned = null,
    } = opts || {}

    const filterTombstoneOrNot = (branch) => {
      const [, leafDetails] = branch[branch.length - 1]
      if (tombstoned === null) {
        // Anything goes
        return true
      } else if (tombstoned === false) {
        // All nodes in the branch must be non-tombstoned
        return branch.every(([, details]) => !details || !details.tombstoned)
      } else if (tombstoned === true) {
        // The leaf must be tombstoned for this branch to be interesting to us
        return leafDetails && !!leafDetails.tombstoned
      }
    }

    if (old && live) {
      return pull(
        cat([branchStreamOld(root), branchStreamLive(root)]),
        pull.filter(filterTombstoneOrNot)
      )
    } else if (old) {
      return pull(branchStreamOld(root), pull.filter(filterTombstoneOrNot))
    } else if (live) {
      return pull(branchStreamLive(root), pull.filter(filterTombstoneOrNot))
    } else {
      return pull.empty()
    }
  }

  return {
    findById,
    branchStream,
  }
}
