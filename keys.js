const crypto = require("crypto")
const ssbKeys = require('ssb-keys')
const derive = require('derive-key')

exports.generateSeed = function() {
  return crypto.randomBytes(32)
}

exports.deriveFeedKeyFromSeed = function(seed, name) {
  if (!name) throw new Error("name was not supplied")
  
  const derived_seed = derive('ssb-meta-feeds', seed, name)
  return ssbKeys.generate("ed25519", derived_seed)
}
