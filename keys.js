const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const hkdf = require('futoin-hkdf')

exports.generateSeed = function () {
  return crypto.randomBytes(32)
}

exports.deriveFeedKeyFromSeed = function (seed, label, feedformat) {
  if (!label) throw new Error('label was not supplied')

  const ED25519_LENGTH = 32

  const derived_seed = hkdf(seed, ED25519_LENGTH, {
    salt: 'ssb',
    info: 'ssb-meta-feed-seed-v1:' + label,
    hash: 'SHA-256',
  })
  const keys = ssbKeys.generate('ed25519', derived_seed)
  if (feedformat === 'bendy butt')
    keys.id = keys.id.replace('ed25519', 'bbfeed-v1')

  return keys
}
