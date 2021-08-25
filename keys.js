const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const hkdf = require('futoin-hkdf')
const SSBURI = require('ssb-uri2')

/**
 * Operations related to keys
 */
const keys = {
  /**
   * Generate a seed value that can be used to derive feeds.
   */
  generateSeed() {
    return crypto.randomBytes(32)
  },

  /**
   * Derive the root meta feed key from a seed.
   *
   * ```js
   * const seed = sbot.metafeeds.keys.generateSeed()
   * const mfKey = sbot.metafeeds.keys.deriveRootMetaFeedKeyFromSeed(seed)
   * ```
   * @param {Buffer} seed
   */
  deriveRootMetaFeedKeyFromSeed(seed) {
    return keys.deriveFeedKeyFromSeed(seed, 'metafeed', 'bendybutt-v1')
  },

  /**
   * Derive a new feed key from a seed. Label must be either `metafeed` for the
   * top level meta feed or a base64 encoded nonce. Feedformat can be either
   * `bendybutt-v1` for a meta feed or `classic`.
   *
   * ```js
   * const seed = sbot.metafeeds.keys.generateSeed()
   * const mfKey = sbot.metafeeds.keys.deriveFeedKeyFromSeed(seed, 'metafeed')
   * ```
   * @param {Buffer} seed
   * @param {string} label
   * @param {'bendybutt-v1' | 'classic'} format default is 'classic'
   */
  deriveFeedKeyFromSeed(seed, label, format) {
    if (!label) throw new Error('label was not supplied')

    const ED25519_LENGTH = 32

    const derived_seed = hkdf(seed, ED25519_LENGTH, {
      salt: 'ssb',
      info: 'ssb-meta-feed-seed-v1:' + label,
      hash: 'SHA-256',
    })
    const keys = ssbKeys.generate('ed25519', derived_seed)
    if (format === 'bendybutt-v1') {
      const classicUri = SSBURI.fromFeedSigil(keys.id)
      const { type, /* format, */ data } = SSBURI.decompose(classicUri)
      const bendyButtUri = SSBURI.compose({ type, format, data })
      keys.id = bendyButtUri
    }

    return keys
  },
}

module.exports = keys
