const crypto = require('crypto')
const bb = require('ssb-bendy-butt')
const { author, and, type, slowEqual } = require('ssb-db2/operators')
const keys = require('./keys')

// FIXME: define and use json schema

exports.init = function (sbot) {
  function add(feedpurpose, nonce, previousMsg, subKeys, mfKeys, metadata) {
    const content = {
      type: 'metafeed/add',
      feedpurpose,
      subfeed: subKeys.id,
      metafeed: mfKeys.id,
      nonce,
      tangles: {
        metafeed: { root: null, previous: null },
      },
    }

    if (metadata) Object.assign(content, metadata)

    const sequence = previousMsg ? previousMsg.value.sequence + 1 : 1
    const previous = previousMsg ? previousMsg.key : null
    const timestamp = Date.now()

    const bbmsg = bb.encodeNew(
      content,
      subKeys,
      mfKeys,
      sequence,
      previous,
      timestamp
    )
    const msgVal = bb.decode(bbmsg)
    return msgVal
  }

  function getNonce() {
    return crypto.randomBytes(32)
  }

  return {
    addExistingFeed(metafeedKeys, previous, feedpurpose, feedKeys, metadata) {
      const nonce = getNonce()
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
      const nonce = getNonce()
      const feedKeys = keys.deriveFeedKeyFromSeed(
        seed,
        nonce.toString('base64')
      )
      if (feedformat === 'bendy butt')
        feedKeys.id = feedKeys.replace('.ed25519', '.bbfeed-v1')
      else if (
        feedformat === 'classic' // default
      );
      else throw ('Unknown feed format', feedformat)

      return add(feedpurpose, nonce, previous, feedKeys, metafeedKeys, metadata)
    },

    tombstoneFeed(metafeedKeys, previousMsg, feedKeys, reason, cb) {
      let query = and(author(metafeedKeys.id), type('metafeed/add'))

      // FIXME: getJITDB() is not a public API
      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        if (err) return cb(err)
        results = results.filter((x) => x.value.content.subfeed === feedKeys.id)
        if (results.length === 0) return cb('no add message found on meta feed')

        const content = {
          type: 'metafeed/tombstone',
          subfeed: feedKeys.id,
          metafeed: metafeedKeys.id,
          reason,
          tangles: {
            metafeed: {
              root: results[0].key,
              previous: results[results.length - 1].key,
            },
          },
        }

        const sequence = previousMsg ? previousMsg.value.sequence + 1 : 1
        const previous = previousMsg ? previousMsg.key : null
        const timestamp = Date.now()
        const bbmsg = bb.encodeNew(
          content,
          feedKeys,
          metafeedKeys,
          sequence,
          previous,
          timestamp
        )
        const msgVal = bb.decode(bbmsg)

        cb(null, msgVal)
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
