// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const run = require('promisify-tuple')
const debug = require('debug')('ssb:meta-feeds')
const validate = require('./validate')

const alwaysTrue = () => true

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

  function loadState(cb) {
    sbot.metafeeds.lookup.loadState(cb)
  }

  function ensureLoaded(feedId, cb) {
    sbot.metafeeds.lookup.ensureLoaded(feedId, cb)
  }

  function findByIdSync(feedId) {
    return sbot.metafeeds.lookup.findByIdSync(feedId)
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
      sbot.metafeeds.query.getLatest(metafeed.keys.id, (err, latest) => {
        if (err) return cb(err)
        const msgVal = sbot.metafeeds.messages.getMsgValAddDerived(
          metafeed.keys,
          latest,
          details.feedpurpose,
          metafeed.seed,
          details.feedformat,
          details.metadata
        )

        const encrypted = typeof msgVal.content === 'string'

        if (!encrypted) {
          const contentSection = [msgVal.content, msgVal.contentSignature]
          const validationResult = validate.validateSingle(contentSection)
          if (validationResult instanceof Error) return cb(validationResult)
        }

        sbot.db.add(msgVal, (err, addedMsg) => {
          if (err) return cb(err)

          function hydrate(msg) {
            const hydratedSubfeed = sbot.metafeeds.query.hydrateFromMsg(
              msg,
              metafeed.seed
            )
            cb(null, hydratedSubfeed)
          }

          if (encrypted)
            sbot.db.get(addedMsg.key, (err, msgVal) =>
              hydrate({
                key: addedMsg.key,
                value: msgVal,
              })
            )
          else hydrate(addedMsg)
        })
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
    const { getLatest } = sbot.metafeeds.query
    const { getMsgValTombstone } = sbot.metafeeds.messages

    find(metafeed, visit, (err, found) => {
      if (err) return cb(err)
      if (!found) return cb(new Error('Cannot find subfeed to tombstone'))

      getLatest(metafeed.keys.id, (err, latest) => {
        if (err) return cb(err)

        getMsgValTombstone(
          metafeed.keys,
          latest,
          found.keys,
          reason,
          (err, msgVal) => {
            if (err) return cb(err)

            sbot.db.add(msgVal, (err, msg) => {
              if (err) return cb(err)

              cb(null, true)
            })
          }
        )
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
      const metafeed = {
        seed,
        keys: sbot.metafeeds.keys.deriveRootMetaFeedKeyFromSeed(seed),
      }
      cb(null, metafeed)
    })
  }

  async function getOrCreateRootMetafeed(cb) {
    if (!rootMetaFeedLock.acquire(cb)) return

    // Pluck relevant internal APIs
    const { deriveRootMetaFeedKeyFromSeed } = sbot.metafeeds.keys
    const { getSeed, getAnnounces, getLatest } = sbot.metafeeds.query
    const { getContentSeed, getContentAnnounce, getMsgValAddExisting } =
      sbot.metafeeds.messages

    // Ensure seed exists
    let mf
    const [err1, loadedSeed] = await run(getSeed)()
    if (err1 || !loadedSeed) {
      if (err1) debug('generating a seed because %o', err1)
      else debug('generating a seed')
      const seed = sbot.metafeeds.keys.generateSeed()
      const mfKeys = deriveRootMetaFeedKeyFromSeed(seed)
      const content = getContentSeed(mfKeys.id, sbot.id, seed)
      const [err2] = await run(sbot.db.publish)(content)
      if (err2) return cb(err2)
      mf = { seed, keys: mfKeys }
    } else {
      debug('loaded seed')
      const mfKeys = deriveRootMetaFeedKeyFromSeed(loadedSeed)
      mf = { seed: loadedSeed, keys: mfKeys }
    }

    // Ensure root meta feed announcement exists on the main feed
    const [err2, announcements] = await run(getAnnounces)()
    if (err2 || !announcements || announcements.length === 0) {
      if (err2) debug('announcing meta feed on main feed because %o', err2)
      else debug('announcing meta feed on main feed')
      const [err3, content] = await run(getContentAnnounce)(mf.keys)
      if (err3) return cb(err3)
      const [err4] = await run(sbot.db.publish)(content)
      if (err4) return cb(err4)
    } else {
      debug('announce post exists on main feed')
    }

    // Ensure the main feed was "added" on the root meta feed
    const [err3, added] = await run(find)(mf, (f) => f.feedpurpose === 'main')
    if (err3) return cb(err3)
    if (!added) {
      const [err4, latest] = await run(getLatest)(mf.keys.id)
      if (err4) return cb(err4)
      debug('adding main feed to root meta feed')
      const msgVal = getMsgValAddExisting(mf.keys, latest, 'main', config.keys)
      const [err5] = await run(sbot.db.add)(msgVal)
      if (err5) return cb(err5)
    } else {
      debug('main feed already added to root meta feed')
    }

    rootMetaFeedLock.release(null, mf)
  }

  return {
    getRoot,
    findOrCreate,
    findAndTombstone,
    findById,
    findByIdSync,
    loadState,
    ensureLoaded,
    branchStream,
  }
}
