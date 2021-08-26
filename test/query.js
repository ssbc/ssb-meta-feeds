const path = require('path')
const test = require('tape')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const ssbKeys = require('ssb-keys')

const keys = require('../keys')
const seed_hex =
  '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const metafeedKeys = keys.deriveFeedKeyFromSeed(
  seed,
  'metafeed',
  'bendybutt-v1'
)

const dir = '/tmp/metafeeds-query'

rimraf.sync(dir)

const mainKey = ssbKeys.loadOrCreateSync(path.join(dir, 'secret'))

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    keys: mainKey,
    path: dir,
  })
let db = sbot.db
let messages = sbot.metafeeds.messages

let indexMsg, indexKey

test('metafeed with multiple feeds', (t) => {
  const classicAddMsgVal = messages.getMsgValAddExisting(
    metafeedKeys,
    null,
    'main',
    mainKey
  )

  db.add(classicAddMsgVal, (err, m) => {
    const indexAddMsgVal = messages.getMsgValAddDerived(
      metafeedKeys,
      m,
      'index',
      seed,
      'classic',
      {
        query: JSON.stringify({
          op: 'and',
          data: [
            { op: 'type', data: 'contact' },
            { op: 'author', data: mainKey.id },
          ],
        }),
      }
    )

    indexKey = keys.deriveFeedKeyFromSeed(
      seed,
      indexAddMsgVal.content.nonce.toString('base64'),
      'classic'
    )

    db.add(indexAddMsgVal, (err, m) => {
      indexMsg = m
      sbot.metafeeds.query.hydrate(metafeedKeys.id, seed, (err, hydrated) => {
        t.equal(hydrated.feeds.length, 2, 'multiple feeds')
        t.equal(hydrated.feeds[0].feedpurpose, 'main')
        t.equal(hydrated.feeds[0].seed, undefined, 'no seed')
        t.equal(
          hydrated.feeds[0].subfeed,
          hydrated.feeds[0].keys.id,
          'correct main keys'
        )
        t.equal(typeof hydrated.feeds[0].keys.id, 'string', 'has key')
        t.equal(hydrated.feeds[1].feedpurpose, 'index')
        t.true(Buffer.isBuffer(hydrated.feeds[1].seed), 'has seed')
        t.equal(
          hydrated.feeds[1].subfeed,
          hydrated.feeds[1].keys.id,
          'correct index keys'
        )
        t.end()
      })
    })
  })
})

test('index metafeed', (t) => {
  sbot.metafeeds.query.getMetadata(indexKey.id, (err, content) => {
    t.equal(JSON.parse(content.query).op, 'and', 'has query')
    t.end()
  })
})

test('metafeed with tombstones', (t) => {
  const reason = 'Feed no longer used'

  messages.getMsgValTombstone(
    metafeedKeys,
    indexMsg,
    indexKey,
    reason,
    (err, msgVal) => {
      db.add(msgVal, (err) => {
        sbot.metafeeds.query.hydrate(metafeedKeys.id, seed, (err, hydrated) => {
          t.equal(hydrated.feeds.length, 1, 'single feed')
          t.equal(hydrated.feeds[0].feedpurpose, 'main')
          t.equal(hydrated.tombstoned.length, 1, '1 tombstone')
          t.equal(hydrated.tombstoned[0].subfeed, indexKey.id, 'tombstone id')
          t.end()
        })
      })
    }
  )
})

test('seed', (t) => {
  const content = messages.getContentSeed(metafeedKeys.id, sbot.id, seed)
  db.publish(content, (err, msg) => {
    console.log('publish2', msg)
    sbot.metafeeds.query.getSeed((err, storedSeed) => {
      t.deepEqual(storedSeed, seed, 'correct seed')
      t.end()
    })
  })
})

test('announce', (t) => {
  messages.getContentAnnounce(metafeedKeys.id, (err, content) => {
    db.publish(content, (err, publishedAnnounce) => {
      t.error(err, 'no err')
      sbot.metafeeds.query.getAnnounces((err, announcements) => {
        t.error(err, 'no err')
        t.equals(announcements.length, 1, '1 announce message')
        const storedAnnounce = announcements[0]
        t.equal(publishedAnnounce.key, storedAnnounce.key, 'correct announce')
        sbot.close(t.end)
      })
    })
  })
})
