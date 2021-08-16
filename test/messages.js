const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const keys = require('../keys')
const seed_hex =
  '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
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
  const msgVal = messages.getMsgValAddExisting(
    metafeedKeys,
    null,
    'main',
    mainKey
  )

  t.true(
    msgVal.contentSignature.endsWith('.sig.ed25519'),
    'correct signature format'
  )
  t.equal(msgVal.content.subfeed, mainKey.id, 'correct subfeed id')
  t.notOk(msgVal.content.nonce, 'should have no nonce')
  t.equal(msgVal.content.metafeed, metafeedKeys.id, 'correct metafeed id')

  db.add(msgVal, (err, kv) => {
    addMsg = kv
    t.end()
  })
})

let tombstoneMsg

test('tombstone a feed in a metafeed', (t) => {
  const reason = 'Feed no longer used'

  messages.getMsgValTombstone(
    metafeedKeys,
    addMsg,
    mainKey,
    reason,
    (err, msgVal) => {
      t.true(
        msgVal.contentSignature.endsWith('.sig.ed25519'),
        'correct signature format'
      )
      t.equal(msgVal.content.subfeed, mainKey.id, 'correct subfeed id')
      t.equal(msgVal.content.tangles.metafeed.root, addMsg.key, 'correct root')
      t.equal(
        msgVal.content.tangles.metafeed.previous,
        addMsg.key,
        'correct previous'
      )
      t.equal(msgVal.content.reason, reason, 'correct reason')

      db.add(msgVal, (err, kv) => {
        tombstoneMsg = kv
        t.end()
      })
    }
  )
})

test('second tombstone', (t) => {
  const msgVal = messages.getMsgValAddDerived(
    metafeedKeys,
    tombstoneMsg,
    'main',
    seed,
    'classic'
  )
  const newMainKey = keys.deriveFeedKeyFromSeed(
    seed,
    msgVal.content.nonce.toString('base64')
  )
  db.add(msgVal, (err, secondAddMsg) => {
    const reason = 'Also no good'

    messages.getMsgValTombstone(
      metafeedKeys,
      secondAddMsg,
      newMainKey,
      reason,
      (err, msg) => {
        t.true(
          msg.contentSignature.endsWith('.sig.ed25519'),
          'correct signature format'
        )
        t.equal(msg.content.subfeed, newMainKey.id, 'correct subfeed id')
        t.equal(
          msg.content.tangles.metafeed.root,
          secondAddMsg.key,
          'correct root'
        )
        t.equal(
          msg.content.tangles.metafeed.previous,
          secondAddMsg.key,
          'correct previous'
        )
        t.equal(msg.content.reason, reason, 'correct reason')

        t.end()
      }
    )
  })
})

test('metafeed announce', (t) => {
  messages.getContentAnnounce(metafeedKeys, (err, content) => {
    t.equal(content.metafeed, metafeedKeys.id, 'correct metafeed')
    t.equal(content.tangles.metafeed.root, null, 'no root')
    t.equal(content.tangles.metafeed.previous, null, 'no previous')

    db.publish(content, (err, announceMsg) => {
      // test that we fucked up somehow and need to create a new metafeed
      const newSeed = keys.generateSeed()
      const mf2Key = keys.deriveFeedKeyFromSeed(newSeed, 'metafeed')
      messages.getContentAnnounce(mf2Key, (err, content) => {
        t.equal(content.metafeed, mf2Key.id, 'correct metafeed')
        t.equal(content.tangles.metafeed.root, announceMsg.key, 'correct root')
        t.equal(
          content.tangles.metafeed.previous,
          announceMsg.key,
          'correct previous'
        )

        db.publish(content, (err, announceMsg2) => {
          // another test to make sure previous is correctly set
          const newSeed2 = keys.generateSeed()
          const mf3Key = keys.deriveFeedKeyFromSeed(newSeed2, 'metafeed')
          messages.getContentAnnounce(mf3Key, (err, msg) => {
            t.equal(msg.metafeed, mf3Key.id, 'correct metafeed')
            t.equal(msg.tangles.metafeed.root, announceMsg.key, 'correct root')
            t.equal(
              msg.tangles.metafeed.previous,
              announceMsg2.key,
              'correct previous'
            )

            t.end()
          })
        })
      })
    })
  })
})

test('metafeed seed save', (t) => {
  const content = messages.getContentSeed(metafeedKeys.id, sbot.id, seed)

  t.equal(content.metafeed, metafeedKeys.id, 'correct metafeed')
  t.equal(content.seed.length, 64, 'correct seed')
  t.equal(content.recps.length, 1, 'recps for private')
  t.equal(content.recps[0], sbot.id, 'correct recps')

  db.publish(content, (err, msg) => {
    t.equal(typeof msg.value.content, 'string', 'encrypted')
    db.get(msg.key, (err, msgGotten) => {
      t.equal(msgGotten.content.seed, seed_hex, 'correct seed extracted')
      sbot.close(t.end)
    })
  })
})
