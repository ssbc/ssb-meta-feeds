const test = require('tape')
const metafeed = require('../metafeed')
const keys = require('../keys')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const seed_hex = '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const mfKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')

const dir = '/tmp/metafeeds-query'

rimraf.sync(dir)

let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('../'))
  .call(null, {
    keys: mfKey,
    path: dir,
  })
let db = sbot.db

const indexKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed/index')
let indexMsgId

test('metafeed with multiple feeds', (t) => {
  const mainKey = keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed/main')
  const msg = metafeed.add('classic', 'main', mainKey, mfKey)

  const msg2 = metafeed.add('classic', 'index', indexKey, mfKey, {
    query: JSON.stringify({
      op: 'and',
      data: [
        { op: 'type', data: 'contact' },
        { op: 'author', data: mainKey.id}
      ]
    })
  })
  
  db.publish(msg, (err) => {
    db.publish(msg2, (err, m) => {
      indexMsgId = m.key
      db.onDrain('base', () => {
        sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
          t.equal(hydrated.feeds.length, 2, "multiple feeds")
          t.equal(hydrated.feeds[0].feedpurpose, 'main')
          t.equal(hydrated.feeds[1].feedpurpose, 'index')
          t.end()
        })
      })
    })
  })
})

test('metafeed with tombstones', (t) => {
  const reason = 'Feed no longer used'

  const msg = metafeed.tombstone(indexKey, indexMsgId, indexMsgId, reason)
  
  db.publish(msg, (err) => {
    db.onDrain('base', () => {
      sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
        t.equal(hydrated.feeds.length, 1, "single feed")
        t.equal(hydrated.feeds[0].feedpurpose, 'main')
        t.equal(hydrated.tombstoned.length, 1, '1 tombstone')
        t.equal(hydrated.tombstoned[0].subfeed, indexKey.id, 'tombstone id')
        t.end()
      })
    })
  })
})

test('index metafeed', (t) => {
  sbot.metafeeds.query.getMetadata(indexKey.id, (err, content) => {
    t.equal(JSON.parse(content.query).op, 'and', "has query")
    t.end()
  })
})

test('seed', (t) => {
  const msg = sbot.metafeeds.messages.generateSeedSaveMsg(mfKey.id, sbot.id, seed)
  db.publish(msg, (err, publish) => {
    db.onDrain('base', () => {
      sbot.metafeeds.query.getSeed((err, storedSeed) => {
        t.deepEqual(storedSeed, seed, "correct seed")
        sbot.close(t.end)
      })
    })
  })
})
