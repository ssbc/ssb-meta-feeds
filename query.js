// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: LGPL-3.0-only

const validate = require('./validate')
const { NOT_METADATA } = require('./constants')
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

    collectMetadata(content) {
      const metadata = {}
      for (const key in content) {
        if (NOT_METADATA.has(key)) continue
        metadata[key] = content[key]
      }
      return metadata
    },

    /**
     * Gets the current state of a subfeed based on the metafeed message that
     * "added" the subfeed
     */
    hydrateFromMsg(msg, seed) {
      const content = msg.value.content
      const { type, feedpurpose, subfeed, nonce, recps } = content
      const metadata = self.collectMetadata(content)
      const feedformat = validate.detectFeedFormat(subfeed)
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
        recps: recps || null,
      }
    },

    /**
     * Gets the current state of a subfeed based on an "opts" argument for
     * "ssb.db.create".
     */
    hydrateFromCreateOpts(opts, seed) {
      const { feedpurpose, subfeed, metafeed, nonce, type, recps } =
        opts.content
      const feedformat = validate.detectFeedFormat(subfeed)
      const existing = type === 'metadata/add/existing'
      const keys = existing
        ? config.keys
        : sbot.metafeeds.keys.deriveFeedKeyFromSeed(
            seed,
            nonce.toString('base64'),
            feedformat
          )
      const metadata = self.collectMetadata(opts.content)
      return {
        metafeed,
        feedformat,
        feedpurpose,
        subfeed,
        keys,
        metadata,
        seed: !existing ? seed : undefined,
        recps: recps || null,
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
              const content = msg.value.content
              const { feedpurpose, subfeed } = content
              const metadata = self.collectMetadata(content)
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
