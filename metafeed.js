const pull = require('pull-stream')

exports.init = function(sbot, config) {
  function getOrCreateFeed(metafeed, feedpurpose, feedformat, metadata, cb) {
    if (!cb) cb = metadata

    const feed = metafeed.feeds.find((f) => f.feedpurpose == feedpurpose)
    // FIXME: if a meta feed, maybe hydrate it?
    if (feed) return cb(null, feed)

    const addMsg = sbot.metafeeds.messages.addNewFeed(
      metafeed.keys,
      metafeed.latest,
      feedpurpose,
      metafeed.seed,
      feedformat,
      metadata
    )
    sbot.db.publishAs(metafeed.keys, addMsg, (err) => {
      if (err) return cb(err)

      // FIXME: onDrain is not a public API
      sbot.db.onDrain('base', () => {
        sbot.metafeeds.query.hydrate(
          metafeed.keys.id,
          metafeed.seed,
          (err, hydrated) => {
            metafeed.feeds = hydrated.feeds

            cb(
              null,
              metafeed.feeds.find((f) => f.feedpurpose == feedpurpose)
            )
          }
        )
      })
    })
  }

  function getOrCreate(cb) {
    pull(
      // start chain with dummy value
      pull.values([{}]),
      pull.asyncMap(function ensureSeedExists(mf, cb) {
        sbot.metafeeds.query.getSeed((err, loadedSeed) => {
          let deriveKey = sbot.metafeeds.keys.deriveFeedKeyFromSeed
          if (err || loadedSeed === null) {
            //debug('generating a seed')
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
            //debug('loaded seed')
            cb(null, {
              seed: loadedSeed,
              keys: deriveKey(loadedSeed, 'metafeed', 'bendy butt'),
            })
          }
        })
      }),
      pull.asyncMap(function ensureMetafeedAnnounceExists(mf, cb) {
        sbot.metafeeds.query.getAnnounce((err, dbAnnounce) => {
          if (!dbAnnounce) {
            //debug('announcing meta feed on main feed')
            sbot.metafeeds.messages.generateAnnounceMsg(
              mf.keys,
              (err, announceMsg) => {
                if (err) return cb(err)
                else sbot.db.publish(announceMsg, (err) => cb(err, mf))
              }
            )
          } else {
            //debug('announce post exists')
            cb(null, mf)
          }
        })
      }),
      pull.asyncMap(function ensureMetafeedAddExists(mf, cb) {
        sbot.metafeeds.query.hydrate(mf.keys.id, mf.seed, (err, hydrated) => {
          const mainFeed = hydrated.feeds.find((f) => f.feedpurpose == 'main')
          if (!mainFeed) {
            //debug('creating main feed')
            const addMsg = sbot.metafeeds.messages.addExistingFeed(
              mf.keys,
              hydrated.latest,
              'main',
              config.keys
            )
            sbot.db.publishAs(mf.keys, addMsg, (err) => {
              if (err) return cb(err)
              else {
                // FIXME: onDrain() is not a public API
                sbot.db.onDrain('base', () => {
                  sbot.metafeeds.query.hydrate(
                    mf.keys.id,
                    mf.seed,
                    (err, hydrated) => {
                      Object.assign(mf, hydrated)
                      cb(err, mf)
                    }
                  )
                })
              }
            })
          } else {
            //debug('main feed exists')
            Object.assign(mf, hydrated)
            cb(null, mf)
          }
        })
      }),
      pull.collect((err, results) => {
        if (err) cb(err)
        else {
          results[0].getOrCreateFeed = (feedpurpose, feedformat, metadata, cb) => {
            getOrCreateFeed(results[0], feedpurpose, feedformat, metadata, cb)
          }
          cb(null, results[0])
        }
      })
    )
  }

  return {
    getOrCreate
  }
}
