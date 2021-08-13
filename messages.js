const crypto = require('crypto')
const bb = require('ssb-bendy-butt')
const {
  where,
  author,
  and,
  or,
  type,
  toCallback,
} = require('ssb-db2/operators')
const keys = require('./keys')

// FIXME: define and use json schema

/**
 * Low level API for generating messages
 */
exports.init = function init(sbot) {
  function add(feedpurpose, nonce, previousMsg, subKeys, mfKeys, metadata) {
    const content = nonce
      ? {
          type: 'metafeed/add/derived',
          feedpurpose,
          subfeed: subKeys.id,
          metafeed: mfKeys.id,
          nonce,
          tangles: {
            metafeed: { root: null, previous: null },
          },
        }
      : {
          type: 'metafeed/add/existing',
          feedpurpose,
          subfeed: subKeys.id,
          metafeed: mfKeys.id,
          tangles: {
            metafeed: { root: null, previous: null },
          },
        }

    if (metadata) Object.assign(content, metadata)

    const sequence = previousMsg ? previousMsg.value.sequence + 1 : 1
    const previous = previousMsg ? previousMsg.key : null
    const timestamp = Date.now()

    if (content.recps && !sbot.box2) {
      throw new Error(
        'Unable to encrypt message without ssb-db2-box2 module loaded'
      )
    }

    const bbmsg = bb.encodeNew(
      content,
      subKeys,
      mfKeys,
      sequence,
      previous,
      timestamp,
      null,
      sbot.box2 ? sbot.box2.encryptBendyButt : null
    )
    const msgVal = bb.decode(bbmsg)
    return msgVal
  }

  function getNonce() {
    return crypto.randomBytes(32)
  }

  return {
    /**
     * Generate a message linking an existing feed to a meta feed. `previous`
     * is the previous message on the meta feed in KVT form. `metadata` is an
     * optional object to be included (object spread) in `msg.value.content`.
     *
     * ```js
     * const msg = sbot.metafeeds.messages.getMsgValAddExisting(metafeedKeys, null, 'main', mainKeys)
     * ```
     */
    getMsgValAddExisting(mfKeys, previous, feedpurpose, feedKeys, metadata) {
      return add(feedpurpose, undefined, previous, feedKeys, mfKeys, metadata)
    },

    /**
     * Generate a message to be posted on meta feed linking feed to a meta feed.
     * Similar to `deriveFeedKeyFromSeed`, `feedformat` can be either
     * `bendybutt-v1` for a meta feed or `classic`. `metadata` is an optional
     * object to be included (object spread) in `msg.value.content`.
     *
     * ```js
     * const msg = sbot.metafeeds.messages.getMsgValAddDerived(metafeedKeys, null, 'main', seed, 'classic')
     * ```
     */
    getMsgValAddDerived(
      mfKeys,
      previous,
      feedpurpose,
      seed,
      feedformat,
      metadata
    ) {
      if (feedformat !== 'classic' && feedformat !== 'bendybutt-v1') {
        throw new Error('Unknown feed format: ' + feedformat)
      }
      const nonce = getNonce()
      const feedKeys = keys.deriveFeedKeyFromSeed(
        seed,
        nonce.toString('base64'),
        feedformat
      )

      return add(feedpurpose, nonce, previous, feedKeys, mfKeys, metadata)
    },

    /**
     * Generate a message to be posted on meta feed tombstoning a feed on a meta
     * feed. `Previous` is the previous message on the meta feed in KVT form.
     *
     * ```js
     * const previous = {
     *   key: '%vv/XLo8lYgFjX9sM44I5F6la2FAp6iREuZ0AVJFp0pU=.bbmsg-v1',
     *   value: {
     *     previous: '%jv9hs2es5Pkw85vSOmLvzQh4HtosbCrVjhT+fR6GPr4=.bbmsg-v1',
     *     // ...
     *   }
     * }
     *
     * sbot.metafeeds.messages.getMsgValTombstone(metafeedKeys, previous, mainKeys, 'No longer used', (err, tombstoneMsg) => {
     *   sbot.db.add(tombstoneMsg, (err) => {
     *     console.log("main is now tombstoned on meta feed")
     *   })
     * })
     * ```
     */
    getMsgValTombstone(mfKeys, previousMsg, feedKeys, reason, cb) {
      sbot.db.query(
        where(
          and(
            author(mfKeys.id),
            or(type('metafeed/add/derived'), type('metafeed/add/existing'))
          )
        ),
        toCallback((err, msgs) => {
          if (err) return cb(err)
          msgs = msgs.filter((x) => x.value.content.subfeed === feedKeys.id)
          if (msgs.length === 0) {
            return cb(new Error('no add message found on meta feed'))
          }

          const content = {
            type: 'metafeed/tombstone',
            subfeed: feedKeys.id,
            metafeed: mfKeys.id,
            reason,
            tangles: {
              metafeed: {
                root: msgs[0].key,
                previous: msgs[msgs.length - 1].key,
              },
            },
          }

          const sequence = previousMsg ? previousMsg.value.sequence + 1 : 1
          const previous = previousMsg ? previousMsg.key : null
          const timestamp = Date.now()
          const bbmsg = bb.encodeNew(
            content,
            feedKeys,
            mfKeys,
            sequence,
            previous,
            timestamp
          )
          const msgVal = bb.decode(bbmsg)

          cb(null, msgVal)
        })
      )
    },

    /**
     * Generate the content of a message to be published on a main feed linking
     * it to a meta feed.
     *
     * ```js
     * sbot.metafeeds.messages.getContentAnnounce(metafeedKeys, (err, content) => {
     *   sbot.db.publish(content, (err) => {
     *     console.log("main feed is now linked to meta feed")
     *   })
     * })
     * ```
     */
    getContentAnnounce(metafeedKeys, cb) {
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/announce'))),
        toCallback((err, msgs) => {
          if (err) return cb(err)
          const rootAnnounceId = msgs.length > 0 ? msgs[0].key : null
          const previousAnnounceId =
            msgs.length > 0 ? msgs[msgs.length - 1].key : null

          const content = {
            type: 'metafeed/announce',
            metafeed: metafeedKeys.id,
            tangles: {
              metafeed: {
                root: rootAnnounceId,
                previous: previousAnnounceId,
              },
            },
          }

          cb(null, content)
        })
      )
    },

    /**
     * Generate the content of a message to save your seed value as a private
     * message on a main feed.
     *
     * ```js
     * const seedContent = sbot.metafeeds.messages.getContentSeed(metafeedKeys.id, sbot.id, seed)
     * sbot.db.publish(seedContent, (err) => {
     *   console.log("seed has now been saved, all feed keys generated from this can be restored from the seed")
     * })
     * ```
     */
    getContentSeed(metafeedId, mainfeedId, seed) {
      return {
        type: 'metafeed/seed',
        metafeed: metafeedId,
        seed: seed.toString('hex'),
        recps: [mainfeedId],
      }
    },
  }
}
