// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const keys = require('../keys')
const { validateMetafeedAnnounce } = require('../validate')
const seed_hex =
  '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const metafeedKeys = keys.deriveFeedKeyFromSeed(
  seed,
  'metafeed',
  'bendybutt-v1'
)

const dir = '/tmp/metafeeds-messages'
const mainKey = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

rimraf.sync(dir)

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('ssb-bendy-butt'))
  .use(require('../'))
  .call(null, {
    keys: mainKey,
    path: dir,
  })
let db = sbot.db
let messages = sbot.metafeeds.messages

let addMsg

test('add a feed to metafeed', (t) => {
  const opts = messages.optsForAddExisting(metafeedKeys, 'main', mainKey)

  t.equal(opts.content.subfeed, mainKey.id, 'correct subfeed id')
  t.notOk(opts.content.nonce, 'should have no nonce')
  t.equal(opts.content.metafeed, metafeedKeys.id, 'correct metafeed id')

  db.create(opts, (err, kvt) => {
    t.error(err, 'no error')
    addMsg = kvt
    t.end()
  })
})

let tombstoneMsg

test('tombstone a feed in a metafeed', (t) => {
  const reason = 'Feed no longer used'

  messages.optsForTombstone(metafeedKeys, mainKey, reason, (err, opts) => {
    t.error(err, 'no error')
    t.equal(opts.content.subfeed, mainKey.id, 'correct subfeed id')
    t.equal(opts.content.tangles.metafeed.root, addMsg.key, 'correct root')
    t.equal(
      opts.content.tangles.metafeed.previous,
      addMsg.key,
      'correct previous'
    )
    t.equal(opts.content.reason, reason, 'correct reason')

    db.create(opts, (err, kv) => {
      t.error(err, 'no error')
      tombstoneMsg = kv
      t.end()
    })
  })
})

test('second tombstone', (t) => {
  const opts = messages.optsForAddDerived(metafeedKeys, 'main', seed, 'classic')
  const newMainKey = keys.deriveFeedKeyFromSeed(
    seed,
    opts.content.nonce.toString('base64')
  )
  db.create(opts, (err, secondAddMsg) => {
    t.error(err, 'no error')
    const reason = 'Also no good'

    messages.optsForTombstone(metafeedKeys, newMainKey, reason, (err, opts) => {
      t.error(err, 'no error')
      t.equal(opts.content.subfeed, newMainKey.id, 'correct subfeed id')
      t.equal(
        opts.content.tangles.metafeed.root,
        secondAddMsg.key,
        'correct root'
      )
      t.equal(
        opts.content.tangles.metafeed.previous,
        secondAddMsg.key,
        'correct previous'
      )
      t.equal(opts.content.reason, reason, 'correct reason')

      t.end()
    })
  })
})

test('metafeed announce', (t) => {
  messages.optsForAnnounce(metafeedKeys, mainKey, (err, opts) => {
    t.error(err, 'no error')
    t.equal(opts.content.metafeed, metafeedKeys.id, 'correct metafeed')
    t.equal(opts.content.tangles.metafeed.root, null, 'no root')
    t.equal(opts.content.tangles.metafeed.previous, null, 'no previous')
    t.ok(opts.content.signature, 'has a signature')
    t.ok(ssbKeys.verifyObj(metafeedKeys, opts.content), 'signature is correct')

    db.create(opts, (err, announceMsg) => {
      t.error(err, 'no error')
      t.equal(validateMetafeedAnnounce(announceMsg), undefined, 'validated')

      // test that we fucked up somehow and need to create a new metafeed
      const newSeed = keys.generateSeed()
      const mf2Key = keys.deriveFeedKeyFromSeed(newSeed, 'metafeed')
      messages.optsForAnnounce(mf2Key, mainKey, (err, opts) => {
        t.error(err, 'no error')
        t.equal(opts.content.metafeed, mf2Key.id, 'correct metafeed')
        t.equal(
          opts.content.tangles.metafeed.root,
          announceMsg.key,
          'correct root'
        )
        t.equal(
          opts.content.tangles.metafeed.previous,
          announceMsg.key,
          'correct previous'
        )

        db.create(opts, (err, announceMsg2) => {
          // another test to make sure previous is correctly set
          const newSeed2 = keys.generateSeed()
          const mf3Key = keys.deriveFeedKeyFromSeed(newSeed2, 'metafeed')
          messages.optsForAnnounce(mf3Key, mainKey, (err, opts) => {
            t.error(err, 'no error')
            t.equal(opts.content.metafeed, mf3Key.id, 'correct metafeed')
            t.equal(
              opts.content.tangles.metafeed.root,
              announceMsg.key,
              'correct root'
            )
            t.equal(
              opts.content.tangles.metafeed.previous,
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
  const opts = messages.optsForSeed(metafeedKeys, sbot.id, seed)

  t.equal(opts.content.metafeed, metafeedKeys.id, 'correct metafeed')
  t.equal(opts.content.seed.length, 64, 'correct seed')
  t.equal(opts.recps.length, 1, 'recps for private')
  t.equal(opts.recps[0], sbot.id, 'correct recps')

  db.create(opts, (err, msg) => {
    t.error(err, 'no error')
    t.equal(typeof msg.value.content, 'string', 'encrypted')
    db.get(msg.key, (err, msgGotten) => {
      t.equal(msgGotten.content.seed, seed_hex, 'correct seed extracted')
      sbot.close(t.end)
    })
  })
})

test('recps', (t) => {
  let sbotBox2 = SecretStack({ appKey: caps.shs })
    .use(require('ssb-db2'))
    .use(require('ssb-bendy-butt'))
    .use(require('../'))
    .call(null, {
      keys: mainKey,
      path: dir + Math.random(),
    })

  const testkey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )

  sbotBox2.box2.setOwnDMKey(testkey)
  sbotBox2.box2.addKeypair(metafeedKeys)

  const opts = sbotBox2.metafeeds.messages.optsForAddExisting(
    metafeedKeys,
    'main',
    mainKey,
    {
      // metadata
      recps: [mainKey.id],
      color: 'blue',
    }
  )

  sbotBox2.db.create(opts, (err, encryptedKVT) => {
    t.error(err, 'no error')
    t.true(encryptedKVT.value.content.endsWith('.box2'), 'box2 encoded')
    sbotBox2.db.get(encryptedKVT.key, (err, decryptedMsgVal) => {
      t.error(err, 'no error')
      t.equal(decryptedMsgVal.content.feedpurpose, 'main', 'purpose')
      t.deepEqual(
        decryptedMsgVal.content.metadata,
        { color: 'blue' },
        'metadata'
      )
      t.deepEqual(decryptedMsgVal.content.recps, [mainKey.id], 'recps')
      sbotBox2.close(t.end)
    })
  })
})
