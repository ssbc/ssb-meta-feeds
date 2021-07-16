const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const bb = require('ssb-bendy-butt')
const { author, and, type } = require('ssb-db2/operators')
const keys = require('./keys')

// FIXME: define and use json schema

exports.init = function (sbot) {
  function add(feedpurpose, nonce, previous, feedKeys, metafeedKeys, metadata) {
    const content = {
      type: 'metafeed/add',
      feedpurpose,
      subfeed: feedKeys.id,
      metafeed: metafeedKeys.id,
      nonce,
      tangles: {
        metafeed: { root: null, previous: null },
      },
    }

    if (metadata) Object.assign(content, metadata)

    return bb.create(
      content,
      metafeedKeys,
      feedKeys,
      previous ? previous.key : null,
      previous ? previous.value.sequence + 1 : 1,
      +new Date()
    )
  }

  function getBase64Nonce() {
    return crypto.randomBytes(32).toString('base64')
  }

  return {
    addExistingFeed(metafeedKeys, previous, feedpurpose, feedKeys, metadata) {
      const nonce = getBase64Nonce()
      return add(feedpurpose, nonce, previous, feedKeys, metafeedKeys, metadata)
    },

    addNewFeed(
      metafeedKeys,
      previous,
      feedpurpose,
      seed,
      feedformat,
      metadata
    ) {
      const nonce = getBase64Nonce()
      const feedKeys = keys.deriveFeedKeyFromSeed(seed, nonce)
      if (feedformat === 'bendy butt')
        feedKeys.id = feedKeys.replace('.ed25519', '.bbfeed-v1')
      else if (
        feedformat === 'classic' // default
      );
      else throw ('Unknown feed format', feedformat)

      return add(feedpurpose, nonce, previous, feedKeys, metafeedKeys, metadata)
    },

    tombstoneFeed(metafeedKeys, previous, feedKeys, reason, cb) {
      let query = and(author(metafeedKeys.id), type('metafeed/add'))

      // FIXME: getJITDB() is not a public API
      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        if (err) return cb(err)
        if (results.length === 0) return cb('no add message found on meta feed')

        const content = {
          type: 'metafeed/tombstone',
          subfeed: feedKeys.id,
          nonce: getBase64Nonce(),
          reason,
          tangles: {
            metafeed: { root: results[0].key, previous: results[0].key },
          },
        }

        cb(
          null,
          bb.create(
            content,
            metafeedKeys,
            feedKeys,
            previous ? previous.key : null,
            previous ? previous.value.sequence + 1 : 1,
            +new Date()
          )
        )
      })
    },

    generateAnnounceMsg(metafeedKeys, cb) {
      let query = and(author(sbot.id), type('metafeed/announce'))

      // FIXME: getJITDB() is not a public API
      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        const rootAnnounceId = results.length > 0 ? results[0].key : null
        const previousAnnounceId =
          results.length > 0 ? results[results.length - 1].key : null

        const msg = {
          type: 'metafeed/announce',
          metafeed: metafeedKeys.id,
          tangles: {
            metafeed: { root: rootAnnounceId, previous: previousAnnounceId },
          },
        }

        cb(null, msg)
      })
    },

    generateSeedSaveMsg(metafeedId, mainfeedId, seed) {
      return {
        type: 'metafeed/seed',
        metafeed: metafeedId,
        seed: seed.toString('hex'),
        recps: [mainfeedId],
      }
    },
  }
}
