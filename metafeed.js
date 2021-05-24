const ssbKeys = require('ssb-keys')
const { author, and, type } = require('ssb-db2/operators')

// FIXME: define and use json schema

exports.init = function(sbot) {
  return {
    add(feedformat, feedpurpose, feedKey, metafeedKey, metadata) {
      let msg = {
        type: 'metafeed/add',
        feedformat,
        feedpurpose,
        subfeed: feedKey.id,
        metafeed: metafeedKey.id, 
        nonce: Date.now(),
        tangle: {
          metafeed: { root: null, previous: null }
        }
      }

      if (metadata)
        msg = Object.assign(msg, metadata)

      msg.subfeedSignature = ssbKeys.sign(feedKey, JSON.stringify(msg))

      return msg
    },

    tombstone(feedKey, mfKey, reason, cb) {
      let query = and(author(mfKey.id), type('metafeed/add'))

      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        if (err) return cb(err)
        if (results.length === 0) return cb("no add message found on meta feed")

        const msg = {
          type: 'metafeed/tombstone',
          subfeed: feedKey.id,
          nonce: Date.now(),
          reason,
          tangle: {
            metafeed: { root: results[0].key, previous: results[0].key }
          }
        }
        msg.subfeedSignature = ssbKeys.sign(feedKey, JSON.stringify(msg))

        cb(null, msg)
      })
    }
  }
}
