const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const keys = require('../keys')
const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const metafeedKeys = keys.deriveFeedKeyFromSeed(seed, 'metafeed', 'bendy butt')

const dir = '/tmp/metafeeds-messages'
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
let messages = sbot.metafeeds.messages

let addMsg

test('add a feed to metafeed', (t) => {
  const msg = messages.addExistingFeed(metafeedKeys, null, 'main', mainKey)

  t.true(msg.contentSignature.endsWith(".sig.ed25519"), "correct signature format")
  t.equal(msg.content.subfeed, mainKey.id, "correct subfeed id")
  t.equal(msg.content.metafeed, metafeedKeys.id, "correct metafeed id")

  db.publishAs(metafeedKeys, msg, (err, kv) => {
    addMsg = kv
    t.end()
  })
})

test('tombstone a feed in a metafeed', (t) => {
  const reason = 'Feed no longer used'

  db.onDrain('base', () => {
    messages.tombstoneFeed(metafeedKeys, addMsg, mainKey, reason, (err, msg) => {
      t.true(msg.contentSignature.endsWith(".sig.ed25519"), "correct signature format")
      t.equal(msg.content.subfeed, mainKey.id, "correct subfeed id")
      t.equal(msg.content.tangles.metafeed.root, addMsg.key, "correct root")
      t.equal(msg.content.tangles.metafeed.previous, addMsg.key, "correct previous")
      t.equal(msg.content.reason, reason, "correct reason")

      t.end()
    })
  })
})

test('metafeed announce', (t) => {
  messages.generateAnnounceMsg(metafeedKeys, (err, msg) => {
    t.equal(msg.metafeed, metafeedKeys.id, 'correct metafeed')
    t.equal(msg.tangles.metafeed.root, null, 'no root')
    t.equal(msg.tangles.metafeed.previous, null, 'no previous')

    db.publish(msg, (err, announceMsg) => {

      // test that we fucked up somehow and need to create a new metafeed
      sbot.db.onDrain('base', () => {
        const newSeed = keys.generateSeed()
        const mf2Key = keys.deriveFeedKeyFromSeed(newSeed, 'metafeed')
        messages.generateAnnounceMsg(mf2Key, (err, msg) => {
          t.equal(msg.metafeed, mf2Key.id, 'correct metafeed')
          t.equal(msg.tangles.metafeed.root, announceMsg.key, 'correct root')
          t.equal(msg.tangles.metafeed.previous, announceMsg.key, 'correct previous')

          db.publish(msg, (err, announceMsg2) => {
            
            // another test to make sure previous is correctly set
            sbot.db.onDrain('base', () => {
              const newSeed2 = keys.generateSeed()
              const mf3Key = keys.deriveFeedKeyFromSeed(newSeed2, 'metafeed')
              messages.generateAnnounceMsg(mf3Key, (err, msg) => {
                t.equal(msg.metafeed, mf3Key.id, 'correct metafeed')
                t.equal(msg.tangles.metafeed.root, announceMsg.key, 'correct root')
                t.equal(msg.tangles.metafeed.previous, announceMsg2.key, 'correct previous')

                t.end()
              })
            })
          })
        })
      })
    })
  })
})

test('metafeed seed save', (t) => {
  const msg = messages.generateSeedSaveMsg(metafeedKeys.id, sbot.id, seed)

  t.equal(msg.metafeed, metafeedKeys.id, 'correct metafeed')
  t.equal(msg.seed.length, 64, 'correct seed')
  t.equal(msg.recps.length, 1, 'recps for private') 
  t.equal(msg.recps[0], sbot.id, 'correct recps')

  db.publish(msg, (err, publish) => {
    t.equal(typeof publish.value.content, 'string', 'encrypted')
    db.get(publish.key, (err, dbPublish) => {
      t.equal(dbPublish.content.seed, seed_hex, 'correct seed extracted')
      sbot.close(t.end)
    })
  })
})
