const test = require('tape')
const keys = require('../keys')

test('generate a seed', (t) => {
  const seed = keys.generateSeed()
  t.equals(seed.toString('hex').length, 64, "correct length")
  
  t.end()
})

test('generate a key for a feed', (t) => {
  const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
  seed = Buffer.from(seed_hex, 'hex')
  const feedKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')
  t.equals(feedKey.id, '@tvebdYZCnNd4VuJUVs4j38QznLUXpHa7n/QYeLALVBM=.ed25519', "correct feed generated")
  
  t.end()
})

test('test failure case in generate a key for a feed', (t) => {
  const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
  seed = Buffer.from(seed_hex, 'hex')
  try {
    const feedKey = keys.deriveFeedKeyFromSeed(seed)
  } catch (ex) {
    t.equals(ex.message, 'name was not supplied', "throws error")
  }
  
  t.end()
})
