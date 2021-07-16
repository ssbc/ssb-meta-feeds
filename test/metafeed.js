const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')

const { author } = require('ssb-db2/operators')

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

test('Base', (t) => {
  // FIXME: getJITDB() is not a public API
  db.getJITDB().all(author(mainKey.id), 0, false, false, (err, results) => {
    t.equals(results.length, 0, 'empty db')

    sbot.metafeeds.metafeed.getOrCreate((err, mf) => {
      t.equals(mf.feeds.length, 1, '1 feed')
      t.equals(mf.feeds[0].feedpurpose, 'main', 'is main feed')
      t.equals(mf.seed.toString('hex').length, 64, 'seed')
      t.equals(typeof mf.keys.id, 'string', 'keys')

      // lets create a new chess feed
      mf.getOrCreateFeed('chess', 'classic', (err, feed) => {
        t.equals(mf.feeds.length, 2, '2 feeds')
        t.equals(feed.feedpurpose, 'chess', 'chess feed')
        sbot.close(t.end)
      })
    })
  })
})

test('Restart', (t) => {
  sbot = SecretStack({ appKey: caps.shs })
    .use(require('ssb-db2'))
    .use(require('../'))
    .call(null, {
      keys: mainKey,
      path: dir,
    })

  sbot.metafeeds.metafeed.getOrCreate((err, mf) => {
    t.ok(Buffer.isBuffer(mf.seed), 'has seed')
    t.ok(mf.keys.id.endsWith('.bbfeed-v1'), 'has key')
    t.equal(mf.feeds.length, 2, 'has 2 feeds')
    t.equal(mf.feeds[0].feedpurpose, 'main', 'main')
    t.equal(mf.feeds[1].feedpurpose, 'chess', 'chess')
    t.equal(mf.tombstoned.length, 0, 'has 0 tombstoned feeds')
    t.ok(mf.latest.key.endsWith('.bbmsg-v1'), 'latest ok')
    sbot.close(t.end)
  })
})
