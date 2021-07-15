const crypto = require('crypto')
const ssbKeys = require('ssb-keys')
const hkdf = require('futoin-hkdf')

exports.generateSeed = function () {
  return crypto.randomBytes(32)
}

exports.deriveFeedKeyFromSeed = function (seed, label, feedformat) {
  if (!label) throw new Error('label was not supplied')

  const salt = 'ssb'

  const hash = 'SHA-256'
  const ed25519_length = 32

  const derived_seed = hkdf(seed, ed25519_length, {
    salt,
    info: 'ssb-meta-feed-seed-v1:' + label,
    hash,
  })
  const keys = ssbKeys.generate('ed25519', derived_seed)
  if (feedformat === 'bendy butt')
    keys.id = keys.id.replace('ed25519', 'bbfeed-v1')

  return keys
}
