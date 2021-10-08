// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const validate = require('./validate')
const {
  and,
  author,
  type,
  where,
  toCallback,
  paginate,
  descending,
} = require('ssb-db2/operators')
const SSBURI = require('ssb-uri2')

exports.init = function (sbot, config) {
  const self = {
    /**
     * Gets the stored seed message (on the main feed) for the root meta feed.
     *
     * ```js
     * sbot.metafeeds.query.getSeed((err, seed) => {
     *   console.log("seed buffer", seed)
     * })
     * ```
     */
    getSeed(cb) {
      // FIXME: maybe use metafeed id
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/seed'))),
        paginate(1),
        descending(),
        toCallback((err, answer) => {
          if (err) return cb(err)
          const msgs = answer.results
          if (msgs.length === 0) return cb(null, null)

          const msg = msgs[0]
          const seedBuf = Buffer.from(msg.value.content.seed, 'hex')
          cb(null, seedBuf)
        })
      )
    },

    /**
     * Gets the meta feed announce messages on main feed.
     *
     * ```js
     * sbot.metafeeds.query.getAnnounces((err, msg) => {
     *   console.log("announce msg", msg)
     * })
     * ```
     */
    getAnnounces(cb) {
      sbot.db.query(
        where(and(author(sbot.id), type('metafeed/announce'))),
        toCallback(cb)
      )
    },

    /**
     * Gets the latest message on the given feed, typically a meta feed, but
     * other feed types work too.
     */
    getLatest(feedId, cb) {
      sbot.db.query(
        where(author(feedId)),
        paginate(1),
        descending(),
        toCallback((err, answer) => {
          if (err) return cb(err)
          const msgs = answer.results
          if (msgs.length !== 1) return cb(null, null)
          const msg = msgs[0]
          cb(null, msg)
        })
      )
    },

    collectMetadata(msg) {
      const metadata = {}
      const ignored = [
        'feedpurpose',
        'subfeed',
        'nonce',
        'metafeed',
        'tangles',
        'type',
      ]
      for (const key of Object.keys(msg.value.content)) {
        if (ignored.includes(key)) continue
        metadata[key] = msg.value.content[key]
      }
      return metadata
    },

    /**
     * Gets the current state of a subfeed based on the meta feed message that
     * "added" the subfeed
     */
    hydrateFromMsg(msg, seed) {
      const { type, feedpurpose, subfeed, nonce } = msg.value.content
      const metadata = self.collectMetadata(msg)
      const feedformat = SSBURI.isBendyButtV1FeedSSBURI(subfeed)
        ? 'bendybutt-v1'
        : 'classic'
      const existing = type === 'metafeed/add/existing'
      const keys = existing
        ? config.keys
        : sbot.metafeeds.keys.deriveFeedKeyFromSeed(
            seed,
            nonce.toString('base64'),
            feedformat
          )
      return {
        metafeed: msg.value.author,
        feedformat,
        feedpurpose,
        subfeed,
        keys,
        metadata,
        seed: !existing ? seed : undefined,
      }
    },

    /**
     * Gets the current state (active feeds) of a meta feed.
     *
     * ```js
     * sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
     *   console.log(hydrated.feeds) // the feeds
     *   console.log(hydrated.feeds[0].feedpurpose) // 'main'
     * })
     * ```
     */
    hydrate(feedId, seed, cb) {
      sbot.db.query(
        where(author(feedId)),
        toCallback((err, msgs) => {
          if (err) return cb(err)

          const validatedMsgs = msgs.filter((msg) => validate.isValid(msg))

          const addedFeeds = validatedMsgs
            .filter((msg) => msg.value.content.type.startsWith('metafeed/add/'))
            .map((msg) => self.hydrateFromMsg(msg, seed))

          const tombstoned = validatedMsgs
            .filter((msg) => msg.value.content.type === 'metafeed/tombstone')
            .map((msg) => {
              const { feedpurpose, subfeed } = msg.value.content
              const metadata = self.collectMetadata(msg)
              return { feedpurpose, subfeed, metadata }
            })

          const feeds = addedFeeds.filter(
            // allow only feeds that have not been tombstoned
            (feed) => !tombstoned.find((t) => t.subfeed === feed.subfeed)
          )

          cb(null, { feeds, tombstoned })
        })
      )
    },
  }

  return self
}
