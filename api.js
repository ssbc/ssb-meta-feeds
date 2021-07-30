const pull = require('pull-stream')
const debug = require('debug')('ssb:meta-feeds')

const alwaysTrue = () => true

exports.init = function (sbot, config) {
  function filterRootMetafeed(visit, cb) {
    sbot.metafeeds.query.getSeed((err, seed) => {
      if (err) return cb(err)
      if (!seed) return cb(null, [])
      const metafeed = {
        seed,
        keys: sbot.metafeeds.keys.deriveFeedKeyFromSeed(
          seed,
          'metafeed',
          'bendy butt'
        ),
      }

      if (visit(metafeed)) {
        cb(null, [metafeed])
      } else {
        cb(null, [])
      }
    })
  }

  function filter(metafeed, maybeVisit, cb) {
    const visit = maybeVisit || alwaysTrue
    if (!metafeed) {
      filterRootMetafeed(visit, cb)
    } else {
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

  function find(metafeed, maybeVisit, cb) {
    const visit = maybeVisit || alwaysTrue
    if (!metafeed) {
      filterRootMetafeed(visit, (err, metafeeds) => {
        if (err) return cb(err)
        cb(null, metafeeds[0])
      })
    } else {
      filter(metafeed, alwaysTrue, (err, feeds) => {
        if (err) return cb(err)
        cb(
          null,
          feeds.find((feed) => visit(feed))
        )
      })
    }
  }

  // TODO: filterTombstoned
  // TODO: findTombstoned

  function create(metafeed, details, cb) {
    if (!metafeed) {
      getOrCreateRootMetafeed(cb)
    } else {
      sbot.metafeeds.query.getLatest(metafeed.keys.id, (err, latest) => {
        if (err) return cb(err)
        const msgValAdd = sbot.metafeeds.messages.addNewFeed(
          metafeed.keys,
          latest,
          details.feedpurpose,
          metafeed.seed,
          details.feedformat,
          details.metadata
        )
        sbot.db.publishAs(metafeed.keys, msgValAdd, (err, msg) => {
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

  function findOrCreate(metafeed, maybeVisit, details, cb) {
    const visit = maybeVisit || alwaysTrue
    if (!metafeed) {
      getOrCreateRootMetafeed(cb)
    } else {
      find(metafeed, visit, (err, found) => {
        if (err) return cb(err)
        if (found) return cb(null, found)
        create(metafeed, details, cb)
      })
    }
  }

  function getOrCreateRootMetafeed(cb) {
    pull(
      // start chain with dummy value
      pull.values([{}]),
      pull.asyncMap(function ensureSeedExists(mf, cb) {
        sbot.metafeeds.query.getSeed((err, loadedSeed) => {
          let deriveKey = sbot.metafeeds.keys.deriveFeedKeyFromSeed
          if (err || loadedSeed === null) {
            debug('generating a seed')
            const seed = sbot.metafeeds.keys.generateSeed()
            const metafeedKeys = deriveKey(seed, 'metafeed', 'bendy butt')
            const seedSaveMsg = sbot.metafeeds.messages.generateSeedSaveMsg(
              metafeedKeys.id,
              sbot.id,
              seed
            )
            sbot.db.publish(seedSaveMsg, (err) =>
              cb(err, { seed, keys: metafeedKeys })
            )
          } else {
            debug('loaded seed')
            cb(null, {
              seed: loadedSeed,
              keys: deriveKey(loadedSeed, 'metafeed', 'bendy butt'),
            })
          }
        })
      }),
      pull.asyncMap(function ensureMetafeedAnnounceExists(mf, cb) {
        sbot.metafeeds.query.getAnnounces((err, announcements) => {
          if (!announcements || announcements.length === 0) {
            debug('announcing meta feed on main feed')
            sbot.metafeeds.messages.generateAnnounceMsg(
              mf.keys,
              (err, announceMsg) => {
                if (err) return cb(err)
                else sbot.db.publish(announceMsg, (err) => cb(err, mf))
              }
            )
          } else {
            debug('announce post exists on main feed')
            cb(null, mf)
          }
        })
      }),
      pull.asyncMap(function ensureMetafeedAddExists(mf, cb) {
        find(
          mf,
          (f) => f.feedpurpose === 'main',
          (err, mainFeed) => {
            if (err) return cb(err)

            if (!mainFeed) {
              sbot.metafeeds.query.getLatest(mf.keys.id, (err, latest) => {
                if (err) return cb(err)
                debug('adding main feed to root meta feed')
                const addMsg = sbot.metafeeds.messages.addExistingFeed(
                  mf.keys,
                  latest,
                  'main',
                  config.keys
                )
                sbot.db.publishAs(mf.keys, addMsg, (err) => {
                  if (err) return cb(err)
                  else {
                    cb(null, mf)
                  }
                })
              })
            } else {
              debug('main feed already added to root meta feed')
              cb(null, mf)
            }
          }
        )
      }),
      pull.collect((err, metafeeds) => {
        if (err) cb(err)
        else {
          const metafeed = metafeeds[0]
          cb(null, metafeed)
        }
      })
    )
  }

  return {
    filter,
    find,
    create,
    findOrCreate,
  }
}
