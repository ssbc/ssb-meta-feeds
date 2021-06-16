const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const bb = require('ssb-bendy-butt')
const { author, and, type } = require('ssb-db2/operators')
const keys = require('./keys')

// FIXME: define and use json schema

exports.init = function(sbot) {
  function add(feedpurpose, nonce, previous, sfKeys, mfKeys, metadata) {
    const content = {
      type: 'metafeed/add',
      feedpurpose,
      subfeed: sfKeys.id,
      metafeed: mfKeys.id, 
      nonce,
      tangles: {
        metafeed: { root: null, previous: null }
      }
    }

    if (metadata)
      Object.assign(content, metadata)

    return bb.create(content, mfKeys, sfKeys, previous ? previous.key : null,
                     previous ? previous.value.sequence+1 : 1, +new Date())
  }

  function getBase64Nonce() {
    return crypto.randomBytes(32).toString('base64')
  }

  return {
    addExisting(feedpurpose, previous, sfKeys, mfKeys, metadata) {
      const nonce = getBase64Nonce()
      return add(feedpurpose, nonce, previous, sfKeys, mfKeys, metadata)
    },

    add(seed, feedformat, feedpurpose, previous, mfKeys, metadata) {
      const nonce = getBase64Nonce()
      const sfKeys = keys.deriveFeedKeyFromSeed(seed, nonce)
      if (feedformat === 'bendy butt')
        sfKeys.id = sfKeys.replace('.ed25519', '.bbfeed-v1')
      else if (feedformat === 'classic')
        ; // default
      else throw 'Unknown feed format', feedformat

      return add(feedpurpose, nonce, previous, sfKeys, mfKeys, metadata)
    },

    tombstone(previous, sfKeys, mfKeys, reason, cb) {
      let query = and(author(mfKeys.id), type('metafeed/add'))

      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        if (err) return cb(err)
        if (results.length === 0) return cb("no add message found on meta feed")

        const content = {
          type: 'metafeed/tombstone',
          subfeed: sfKeys.id,
          nonce: getBase64Nonce(),
          reason,
          tangles: {
            metafeed: { root: results[0].key, previous: results[0].key }
          }
        }

        cb(null, bb.create(content, mfKeys, sfKeys, previous ? previous.key : null,
                           previous ? previous.value.sequence+1 : 1, +new Date()))
      })
    }
  }
}
