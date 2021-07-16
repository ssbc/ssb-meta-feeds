const test = require('tape')
const crypto = require('crypto')
const keys = require('../keys')

test('generate a seed', (t) => {
  const seed = keys.generateSeed()
  t.equals(seed.toString('hex').length, 64, 'correct length')

  t.end()
})

const seed_hex =
  '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')

test('generate a key for a feed', (t) => {
  const feedKey = keys.deriveFeedKeyFromSeed(seed, 'metafeed', 'bendy butt')
  t.equals(
    feedKey.id,
    '@0hyf48bX1JcGxGvwiMXzmEWodZvJZvDXxPiKhq3QlSw=.bbfeed-v1',
    'correct feed generated'
  )

  const nonce = 'aumEXI0cdPx1sfX1nx5Y9Pl2GmwocYiFhv9o6K9BIhA='
  const classicFeedKey = keys.deriveFeedKeyFromSeed(seed, nonce) // default classic
  t.equals(
    classicFeedKey.id,
    '@nFiLP62RZCGHCtmXScWERRxAJyTdWudAgPXODHATTgE=.ed25519',
    'correct feed generated'
  )

  t.end()
})

test('test failure case in generate a key for a feed', (t) => {
  try {
    const feedKey = keys.deriveFeedKeyFromSeed(seed)
  } catch (ex) {
    t.equals(ex.message, 'label was not supplied', 'throws error')
  }

  t.end()
})
