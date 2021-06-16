const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const keys = require('../keys')
const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const mfKey = keys.deriveFeedKeyFromSeed(seed, 'metafeed', 'bendy butt')

const dir = '/tmp/metafeeds-metafeed'
const mainKey = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

rimraf.sync(dir)

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    keys: mainKey,      
    path: dir,
  })
let db = sbot.db
let metafeed = sbot.metafeeds.metafeed

let addMsg

test('add a feed to metafeed', (t) => {
  const msg = metafeed.addExisting('main', null, mainKey, mfKey)

  t.true(msg.contentSignature.endsWith(".sig.ed25519"), "correct signature format")
  t.equal(msg.content.subfeed, mainKey.id, "correct subfeed id")
  t.equal(msg.content.metafeed, mfKey.id, "correct metafeed id")

  db.publishAs(mfKey, msg, (err, kv) => {
    addMsg = kv
    t.end()
  })
})

test('tombstone a feed in a metafeed', (t) => {
  const reason = 'Feed no longer used'

  db.onDrain('base', () => {
    metafeed.tombstone(addMsg, mainKey, mfKey, reason, (err, msg) => {
      t.true(msg.contentSignature.endsWith(".sig.ed25519"), "correct signature format")
      t.equal(msg.content.subfeed, mainKey.id, "correct subfeed id")
      t.equal(msg.content.tangles.metafeed.root, addMsg.key, "correct root")
      t.equal(msg.content.tangles.metafeed.previous, addMsg.key, "correct previous")
      t.equal(msg.content.reason, reason, "correct reason")

      sbot.close(t.end)
    })
  })
})
