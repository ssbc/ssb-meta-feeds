const test = require('tape')
const metafeed = require('../metafeed')
const keys = require('../keys')

test('add a feed to metafeed', (t) => {
  const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
  const seed = Buffer.from(seed_hex, 'hex')
  const mfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')
  const sfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed/main')

  const msg = metafeed.add('classic', 'main', sfKey, mfKey)
  //console.log(msg)
  t.true(msg.subfeedSignature.endsWith(".sig.ed25519"), "correct signature format")
  t.equal(msg.subfeed, sfKey.id, "correct subfeed id")
  t.equal(msg.metafeed, mfKey.id, "correct metafeed id")

  t.end()
})

test('tombstone a feed in a metafeed', (t) => {
  const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
  const seed = Buffer.from(seed_hex, 'hex')
  const mfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')
  const sfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed/main')

  const rootId = "%msofmfos"
  const previousId = "%test"
  const reason = 'Feed no longer used'

  const msg = metafeed.tombstone(sfKey, rootId, previousId, reason)
  //console.log(msg)
  t.true(msg.subfeedSignature.endsWith(".sig.ed25519"), "correct signature format")
  t.equal(msg.subfeed, sfKey.id, "correct subfeed id")
  t.equal(msg.tangle.metafeed.root, rootId, "correct root")
  t.equal(msg.tangle.metafeed.previous, previousId, "correct previous")
  t.equal(msg.reason, reason, "correct reason")

  t.end()
})
