const { seekKey } = require('bipf')
const {
  and,
  author,
  type,
  where,
  toCallback,
  equal,
} = require('ssb-db2/operators')

function subfeed(feedId) {
  const bValue = Buffer.from('value')
  const bContent = Buffer.from('content')
  const bSubfeed = Buffer.from('subfeed')

  function seekSubfeed(buffer) {
    let p = 0 // note you pass in p!
    p = seekKey(buffer, p, bValue)
    if (p < 0) return
    p = seekKey(buffer, p, bContent)
    if (p < 0) return
    return seekKey(buffer, p, bSubfeed)
  }

  return equal(seekSubfeed, feedId, {
    prefix: 32,
    prefixOffset: 1,
    indexType: 'value_content_subfeed',
  })
}

exports.init = function (sbot, config) {
  return {
    getSeed(cb) {
      // FIXME: maybe use metafeed id
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/seed'))),
        toCallback((err, msgs) => {
          if (err) return cb(err)
          if (msgs.length === 0) return cb(null, null)

          const msg = msgs[0]
          const seedBuf = Buffer.from(msg.value.content.seed, 'hex')
          cb(null, seedBuf)
        })
      )
    },

    getAnnounce(cb) {
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/announce'))),
        toCallback((err, msgs) => {
          // FIXME: handle multiple results properly?
          cb(err, msgs.length > 0 ? msgs[0] : null)
        })
      )
    },

    getMetadata(feedId, cb) {
      sbot.db.query(
        where(subfeed(feedId)),
        toCallback((err, msgs) => {
          if (err) return cb(err)

          msgs = msgs.filter((msg) => msg.value.content.type === 'metafeed/add')
          // FIXME: handle multiple results properly?
          cb(null, msgs.length > 0 ? msgs[0].value.content : null)
        })
      )
    },

    hydrate(feedId, seed, cb) {
      sbot.db.query(
        where(author(feedId)),
        toCallback((err, results) => {
          if (err) return cb(err)

          const feeds = results
            .filter((msg) => msg.value.content.type === 'metafeed/add')
            .map((msg) => {
              const { feedpurpose, subfeed, nonce } = msg.value.content

              let keys
              if (subfeed === sbot.id) keys = config.keys
              else
                keys = sbot.metafeeds.keys.deriveFeedKeyFromSeed(
                  seed,
                  nonce.toString('base64')
                )

              return {
                feedpurpose,
                subfeed,
                keys,
              }
            })

          const tombstoned = results
            .filter((msg) => msg.value.content.type === 'metafeed/tombstone')
            .map((msg) => {
              const { feedpurpose, subfeed } = msg.value.content
              return {
                feedpurpose,
                subfeed,
              }
            })

          const latest = results.length > 0 ? results[results.length - 1] : null

          cb(null, {
            feeds: feeds.filter(
              (feed) =>
                tombstoned.filter((t) => t.subfeed === feed.subfeed).length ===
                0
            ),
            tombstoned,
            latest,
          })
        })
      )
    },
  }
}
