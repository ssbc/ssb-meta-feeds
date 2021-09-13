const run = require('promisify-tuple')
const debug = require('debug')('ssb:meta-feeds')
const validate = require('./validate')

const alwaysTrue = () => true

exports.init = function (sbot, config) {
  function filterRootMetafeed(visit, cb) {
    sbot.metafeeds.query.getSeed((err, seed) => {
      if (err) return cb(err)
      if (!seed) return cb(null, [])
      const metafeed = {
        seed,
        keys: sbot.metafeeds.keys.deriveRootMetaFeedKeyFromSeed(seed),
      }

      if (visit(metafeed)) {
        cb(null, [metafeed])
      } else {
        cb(null, [])
      }
    })
  }

  function filter(metafeed, maybeVisit, maybeCB) {
    const visit = maybeVisit || alwaysTrue
    if (!metafeed) {
      const cb = maybeCB
      filterRootMetafeed(visit, cb)
    } else if (typeof metafeed === 'function') {
      const cb = metafeed
      filterRootMetafeed(visit, cb)
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

  function find(metafeed, maybeVisit, maybeCB) {
    const visit = maybeVisit || alwaysTrue
    if (!metafeed) {
      const cb = maybeCB
      filterRootMetafeed(visit, (err, metafeeds) => {
        if (err) return cb(err)
        cb(null, metafeeds[0])
      })
    } else if (typeof metafeed === 'function') {
      const cb = metafeed
      filterRootMetafeed(visit, (err, metafeeds) => {
        if (err) return cb(err)
        cb(null, metafeeds[0])
      })
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

  function findByIdSync(feedId) {
    return sbot.metafeeds.lookup.findByIdSync(feedId)
  }

  function filterTombstoned(metafeed, maybeVisit, cb) {
    if (!metafeed || typeof metafeed === 'function') {
      cb(new Error('filterTombstoned() requires a valid metafeed argument'))
    } else {
      const visit = maybeVisit || alwaysTrue
      sbot.metafeeds.query.hydrate(
        metafeed.keys.id,
        metafeed.seed,
        (err, hydrated) => {
          if (err) return cb(err)
          if (visit === alwaysTrue) return cb(null, hydrated.tombstoned)
          const filtered = hydrated.tombstoned.filter((feed) => visit(feed))
          cb(null, filtered)
        }
      )
    }
  }

  function findTombstoned(metafeed, maybeVisit, cb) {
    if (!metafeed || typeof metafeed === 'function') {
      cb(new Error('findTombstoned() requires a valid metafeed argument'))
    } else {
      filterTombstoned(metafeed, maybeVisit, (err, tombstoned) => {
        if (err) return cb(err)
        if (tombstoned.length === 0) return cb(null, null)
        const found = tombstoned[0]
        cb(null, found)
      })
    }
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
        const contentSection = [msgVal.content, msgVal.contentSignature]
        const validationResult = validate.validateSingle(contentSection)
        if (validationResult instanceof Error) return cb(validationResult)
        sbot.db.add(msgVal, (err, msg) => {
          if (err) return cb(err)
          const hydratedSubfeed = sbot.metafeeds.query.hydrateFromMsg(
            msg,
            metafeed.seed
          )
          cb(null, hydratedSubfeed)
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
      find(metafeed, maybeVisit, (err, found) => {
        if (err) return cb(err)
        if (found) return cb(null, found)
        create(metafeed, details, cb)
      })
    }
  }

  // lock to solve concurrent getOrCreateRootMetafeed
  const rootMetaFeedLock = {
    _cbs: [],
    acquire(cb) {
      this._cbs.push(cb)
      return this._cbs.length === 1
    },
    release(err, mf) {
      const cbs = this._cbs
      this._cbs = []
      for (const cb of cbs) cb(err, mf)
    },
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
    filter,
    find,
    findById,
    findByIdSync,
    loadState,
    create,
    findOrCreate,
    filterTombstoned,
    findTombstoned,
  }
}
