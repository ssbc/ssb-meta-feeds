// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const run = require('promisify-tuple')
const deepEqual = require('fast-deep-equal')
const debug = require('debug')('ssb:meta-feeds')
const pickShard = require('./pick-shard')

const alwaysTrue = () => true
const BB1 = 'bendybutt-v1'
const v1Details = { feedpurpose: 'v1', feedformat: BB1 }
const v1Visit = detailsToVisit(v1Details)
function detailsToVisit(details) {
  return (feed) => {
    return (
      feed.feedpurpose === details.feedpurpose &&
      feed.feedformat === details.feedformat &&
      deepEqual(feed.metadata, details.metadata || {})
    )
  }
}

exports.init = function (sbot, config) {
  function filter(metafeed, visit, maybeCB) {
    if (!metafeed) {
      cb(new Error('expected metafeed argument'))
    } else if (typeof metafeed === 'function') {
      cb(new Error('expected metafeed argument and visit argument'))
    } else {
      const cb = maybeCB
      sbot.metafeeds.query.hydrate(
        metafeed.keys.id,
        metafeed.seed,
        (err, hydrated) => {
          if (err) return cb(err)
          if (visit === alwaysTrue) return cb(null, hydrated.feeds)
          const filtered = hydrated.feeds.filter((feed) => visit(feed))
          cb(null, filtered)
        }
      )
    }
  }

  function find(metafeed, visit, maybeCB) {
    if (!metafeed) {
      cb(new Error('expected metafeed argument'))
    } else if (typeof metafeed === 'function') {
      cb(new Error('expected metafeed argument and visit argument'))
    } else {
      const cb = maybeCB
      filter(metafeed, visit, (err, feeds) => {
        if (err) return cb(err)
        if (feeds.length === 0) return cb(null, null)
        const found = feeds[0]
        cb(null, found)
      })
    }
  }

  function findById(feedId, cb) {
    sbot.metafeeds.lookup.findById(feedId, cb)
  }

  function branchStream(opts) {
    return sbot.metafeeds.lookup.branchStream(opts)
  }

  function create(metafeed, details, maybeCB) {
    if (!metafeed) {
      const cb = maybeCB
      getOrCreateRootMetafeed(cb)
    } else if (typeof metafeed === 'function') {
      const cb = metafeed
      getOrCreateRootMetafeed(cb)
    } else {
      const cb = maybeCB
      if (!details.feedpurpose) return cb(new Error('Missing feedpurpose'))
      if (!details.feedformat) return cb(new Error('Missing feedformat'))

      const { keys, seed } = metafeed
      const { feedpurpose, feedformat, metadata } = details
      const opts = sbot.metafeeds.messages.optsForAddDerived(
        keys,
        feedpurpose,
        seed,
        feedformat,
        metadata
      )
      sbot.db.create(opts, (err) => {
        if (err) return cb(err)
        cb(null, sbot.metafeeds.query.hydrateFromCreateOpts(opts, seed))
      })
    }
  }

  function findOrCreate(metafeed, maybeVisit, details, maybeCB) {
    if (!metafeed) {
      const cb = maybeCB
      getOrCreateRootMetafeed(cb)
    } else if (typeof metafeed === 'function') {
      const cb = metafeed
      getOrCreateRootMetafeed(cb)
    } else {
      const cb = maybeCB
      const visit = maybeVisit || alwaysTrue
      find(metafeed, visit, (err, found) => {
        if (err) return cb(err)
        if (found) return cb(null, found)
        create(metafeed, details, cb)
      })
    }
  }

  function findAndTombstone(metafeed, visit, reason, cb) {
    const { optsForTombstone } = sbot.metafeeds.messages

    find(metafeed, visit, (err, found) => {
      if (err) return cb(err)
      if (!found) return cb(new Error('Cannot find subfeed to tombstone'))

      optsForTombstone(metafeed.keys, found.keys, reason, (err, opts) => {
        if (err) return cb(err)
        sbot.db.create(opts, (err, msg) => {
          if (err) return cb(err)
          cb(null, true)
        })
      })
    })
  }

  // lock to solve concurrent getOrCreateRootMetafeed
  const rootMetaFeedLock = {
    _cbs: [],
    _cachedMF: null,
    acquire(cb) {
      if (this._cachedMF) {
        cb(null, this._cachedMF)
        return false
      }
      this._cbs.push(cb)
      return this._cbs.length === 1
    },
    release(err, mf) {
      this._cachedMF = mf
      const cbs = this._cbs
      this._cbs = []
      for (const cb of cbs) cb(err, mf)
    },
  }

  function getRoot(cb) {
    sbot.metafeeds.query.getSeed((err, seed) => {
      if (err) return cb(err)
      if (!seed) return cb(null, null)
      cb(null, buildRootFeedDetails(seed))
    })
  }

  async function getOrCreateRootMetafeed(cb) {
    if (!rootMetaFeedLock.acquire(cb)) return

    // Pluck relevant internal APIs
    const { deriveRootMetaFeedKeyFromSeed } = sbot.metafeeds.keys
    const { getSeed, getAnnounces } = sbot.metafeeds.query
    const { optsForSeed, optsForAnnounce, optsForAddExisting } =
      sbot.metafeeds.messages

    // Ensure seed exists
    let mf
    const [err1, loadedSeed] = await run(getSeed)()
    if (err1 || !loadedSeed) {
      if (err1) debug('generating a seed because %o', err1)
      else debug('generating a seed')
      const seed = sbot.metafeeds.keys.generateSeed()
      const mfKeys = deriveRootMetaFeedKeyFromSeed(seed)
      const opts = optsForSeed(mfKeys, sbot.id, seed)
      const [err2] = await run(sbot.db.create)(opts)
      if (err2) return cb(err2)
      mf = buildRootFeedDetails(seed)
    } else {
      debug('loaded seed')
      mf = buildRootFeedDetails(loadedSeed)
    }

    // Ensure root meta feed announcement exists on the main feed
    const [err2, announcements] = await run(getAnnounces)()
    if (err2 || !announcements || announcements.length === 0) {
      if (err2) debug('announcing meta feed on main feed because %o', err2)
      else debug('announcing meta feed on main feed')
      const [err3, opts] = await run(optsForAnnounce)(mf.keys, config.keys)
      if (err3) return cb(err3)
      const [err4] = await run(sbot.db.create)(opts)
      if (err4) return cb(err4)
    } else {
      debug('announce post exists on main feed')
    }

    // Ensure the main feed was "added" on the root meta feed
    const [err3, added] = await run(find)(mf, (f) => f.feedpurpose === 'main')
    if (err3) return cb(err3)
    if (!added) {
      debug('adding main feed to root meta feed')
      const opts = optsForAddExisting(mf.keys, 'main', config.keys)
      const [err5] = await run(sbot.db.create)(opts)
      if (err5) return cb(err5)
    } else {
      debug('main feed already added to root meta feed')
    }

    rootMetaFeedLock.release(null, mf)
  }

  function buildRootFeedDetails(seed) {
    const keys = sbot.metafeeds.keys.deriveRootMetaFeedKeyFromSeed(seed)
    return {
      metafeed: null,
      subfeed: keys.id,
      feedpurpose: 'root',
      feedformat: 'bendybutt-v1',
      seed,
      keys,
      metadata: {},
    }
  }

  function commonFindOrCreate(details, cb) {
    if (!details.feedformat) details.feedformat = 'classic'

    findOrCreate((err, rootFeed) => {
      if (err) return cb(err)

      findOrCreate(rootFeed, v1Visit, v1Details, (err, v1Feed) => {
        if (err) return cb(err)

        const shardDetails = {
          feedpurpose: pickShard(rootFeed.keys.id, details.feedpurpose),
          feedformat: BB1,
        }
        const shardVisit = detailsToVisit(shardDetails)

        findOrCreate(v1Feed, shardVisit, shardDetails, (err, shardFeed) => {
          if (err) return cb(err)

          findOrCreate(shardFeed, detailsToVisit(details), details, cb)
        })
      })
    })
  }

  return {
    branchStream,
    findOrCreate: commonFindOrCreate,

    advanced: {
      getRoot,
      findOrCreate,
      findAndTombstone,
      findById,
    },
  }
}
