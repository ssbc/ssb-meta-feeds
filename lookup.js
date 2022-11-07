// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const { seekKey } = require('bipf')
const pull = require('pull-stream')
const cat = require('pull-cat')
const Notify = require('pull-notify')
const Defer = require('pull-defer')
const DeferredPromise = require('p-defer')
const deepEqual = require('fast-deep-equal')
const printTreeLibrary = require('print-tree')
const {
  where,
  live,
  equal,
  authorIsBendyButtV1,
  toPullStream,
  toCallback,
} = require('ssb-db2/operators')
const validate = require('./validate')
const { NOT_METADATA, BB1 } = require('./constants')

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

function rootFeedDetails(id) {
  return {
    id,
    parent: null,
    purpose: 'root',
    feedFormat: BB1,
    metadata: {},
  }
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

  function msgToDetails(msg) {
    const content = msg.value.content
    const details = {}
    if (content.subfeed) details.id = content.subfeed
    if (content.metafeed) details.parent = content.metafeed
    if (content.feedpurpose) details.purpose = content.feedpurpose
    details.feedFormat = validate.detectFeedFormat(content.subfeed)
    details.recps = content.recps || null
    details.metadata = {} || details.metadata
    const keys = Object.keys(content).filter((k) => !NOT_METADATA.has(k))
    for (const key of keys) {
      details.metadata[key] = content[key]
    }
    if (content.type === 'metafeed/tombstone') {
      details.tombstoned = true
      details.reason = content.reason
    }
    return details
  }

  function updateLookupFromMsg(msg) {
    const details = msgToDetails(msg)
    const isNew = msg.value.content.type.startsWith('metafeed/add/')
    updateLookup(details, isNew)
  }

  function updateLookupFromCreatedFeed(details) {
    updateLookup(details, true)
  }

  function updateLookup(details, isNew) {
    const { id, parent } = details

    // Update roots
    if (!detailsLookup.has(parent)) {
      detailsLookup.set(parent, rootFeedDetails(parent))
      roots.add(parent)
    }

    // Update children
    if (isNew) {
      if (childrenLookup.has(parent)) {
        const children = childrenLookup.get(parent)
        if (!children.has(id)) children.add(id)
      } else {
        const children = new Set()
        children.add(id)
        childrenLookup.set(parent, children)
      }
    }

    // Update details
    const prevDetails = detailsLookup.get(id)
    if (deepEqual(prevDetails, details)) return
    const nextDetails = { ...prevDetails, ...details }
    detailsLookup.set(id, nextDetails)
    roots.delete(id)
    ensureQueue.flush(id)

    if (notifyNewBranch) notifyNewBranch(makeBranch(id))
  }

  function loadState() {
    loadStateRequested = true
    notifyNewBranch = Notify()

    pull(
      sbot.db.query(where(authorIsBendyButtV1()), toPullStream()),
      pull.filter((msg) => validate.isValid(msg)),
      pull.drain(updateLookupFromMsg, (err) => {
        if (err) return console.error(err)

        stateLoadedP.resolve()

        sbot.close.hook(function (fn, args) {
          if (liveDrainer) liveDrainer.abort(true)
          if (notifyNewBranch) notifyNewBranch.abort(true)
          fn.apply(this, args)
        })

        pull(
          sbot.db.query(where(authorIsBendyButtV1()), live(), toPullStream()),
          pull.filter((msg) => validate.isValid(msg)),
          (liveDrainer = pull.drain(updateLookupFromMsg))
        )
      })
    )
  }

  function makeBranch(id) {
    const details = detailsLookup.get(id)
    const branch = [details]
    while (branch[0].parent) {
      const metafeedId = branch[0].parent
      const parentDetails =
        detailsLookup.get(metafeedId) || rootFeedDetails(metafeedId)
      branch.unshift(parentDetails)
    }
    return branch
  }

  function traverseBranchesUnder(feedId, previousBranch, visit) {
    const details =
      previousBranch.length === 0
        ? rootFeedDetails(feedId)
        : detailsLookup.get(feedId) || null
    const branch = [...previousBranch, details]
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
          const idx = branch.findIndex((feed) => feed.id === rootMetafeedId)
          if (idx < 0) return []
          else if (idx === 0) return branch
          else return branch.slice(idx)
        }),
        pull.filter(function hasRoot(branch) {
          return branch.length > 0 && branch[0].id === rootMetafeedId
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

        const details = msgToDetails(msgs[0])
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
      const leafDetails = branch[branch.length - 1]
      if (tombstoned === null) {
        // Anything goes
        return true
      } else if (tombstoned === false) {
        // All nodes in the branch must be non-tombstoned
        return branch.every((feed) => !feed.tombstoned)
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

  function getTree(root, cb) {
    const tree = {}
    pull(
      branchStream({ root, old: true, live: false }),
      pull.drain(
        (branch) => {
          for (let i = 0; i < branch.length; i++) {
            const node = branch[i]
            if (i === 0) currentNode = tree
            else {
              const parent = currentNode
              currentNode = parent.children.find(
                (child) => child.id === node.id
              )
              if (!currentNode) {
                parent.children.push((currentNode = {}))
              }
            }
            if (!currentNode.id) {
              currentNode.id = node.id
              currentNode.purpose = node.purpose
              currentNode.feedFormat = node.feedFormat
              currentNode.metadata = node.metadata
              currentNode.children = []
            }
          }
        },
        (err) => {
          if (err) return cb(err)
          cb(null, tree)
        }
      )
    )
  }

  function printTreeNodeNameSimple({ purpose }) {
    return purpose
  }

  function printTreeNodeNameWithId({ purpose, id }) {
    return `${purpose} (${id})`
  }

  function printTreeNodeChildren(node) {
    return node.children
  }

  function printTree(root, opts, cb) {
    const printTreeNodeName =
      opts && opts.id ? printTreeNodeNameWithId : printTreeNodeNameSimple
    getTree(root, (err, tree) => {
      if (err) return cb(err)
      cb(null, printTreeLibrary(tree, printTreeNodeName, printTreeNodeChildren))
    })
  }

  return {
    findById,
    branchStream,
    getTree,
    printTree,
    updateLookupFromCreatedFeed,
  }
}
