const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const keys = require('../keys')
const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const mfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')

const dir = '/tmp/metafeeds-metafeed'
const mainKey = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

rimraf.sync(dir)

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    // we have to use metafeed key in sbot so we can post messages
    keys: mfKey,      
    path: dir,
  })
let db = sbot.db
let metafeed = sbot.metafeeds.metafeed

let addMsgKey

test('add a feed to metafeed', (t) => {
  const msg = metafeed.add('classic', 'main', mainKey, mfKey)

  //console.log(msg)
  t.true(msg.subfeedSignature.endsWith(".sig.ed25519"), "correct signature format")
  t.equal(msg.subfeed, mainKey.id, "correct subfeed id")
  t.equal(msg.metafeed, mfKey.id, "correct metafeed id")

  db.publish(msg, (err, dbMsg) => {
    addMsgKey = dbMsg.key
    t.end()
  })
})

test('tombstone a feed in a metafeed', (t) => {
  const reason = 'Feed no longer used'

  db.onDrain('base', () => {
    metafeed.tombstone(mainKey, mfKey, reason, (err, msg) => {
      //console.log(msg)
      t.true(msg.subfeedSignature.endsWith(".sig.ed25519"), "correct signature format")
      t.equal(msg.subfeed, mainKey.id, "correct subfeed id")
      t.equal(msg.tangles.metafeed.root, addMsgKey, "correct root")
      t.equal(msg.tangles.metafeed.previous, addMsgKey, "correct previous")
      t.equal(msg.reason, reason, "correct reason")

      sbot.close(t.end)
    })
  })
})
