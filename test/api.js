const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const SecretStack = require('secret-stack')
const caps = require('ssb-caps')
const { author, where, toCallback } = require('ssb-db2/operators')
const tape = require('tape')

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

test('find() and filter() when there is nothing', (t) => {
  sbot.metafeeds.find(null, null, (err, found) => {
    t.error(err, 'no err for find()')
    t.notOk(found, 'nothing found')

    sbot.metafeeds.filter(null, null, (err, found) => {
      t.error(err, 'no err for filter()')
      t.equals(found.length, 0, 'nothing found')
      t.end()
    })
  })
})

test('findOrCreate(null, ...) can create the root metafeed', (t) => {
  db.query(
    where(author(mainKey.id)),
    toCallback((err, msgs) => {
      t.equals(msgs.length, 0, 'empty db')

      sbot.metafeeds.findOrCreate(null, null, {}, (err, mf) => {
        t.error(err, 'no err for findOrCreate()')
        // t.equals(mf.feeds.length, 1, '1 sub feed in the root metafeed')
        // t.equals(mf.feeds[0].feedpurpose, 'main', 'it is the main feed')
        t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
        t.equals(typeof mf.keys.id, 'string', 'key seems okay')
        t.end()
      })
    })
  )
})

test('find / create / findOrCreate are idempotent', (t) => {
  sbot.metafeeds.find(null, null, (err, mf) => {
    t.error(err, 'no err for find()')
    t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
    t.equals(typeof mf.keys.id, 'string', 'key seems okay')
    const originalSeed = mf.seed.toString('hex')
    const originalID = mf.keys.id

    sbot.metafeeds.filter(null, null, (err, allFound) => {
      t.equals(allFound.length, 1, 'got root metafeed without creating it')

      sbot.metafeeds.findOrCreate(null, null, {}, (err, mf) => {
        t.error(err, 'no err for findOrCreate(null, ...)')
        t.equals(mf.seed.toString('hex'), originalSeed, 'same seed')
        t.equals(mf.keys.id, originalID, 'same ID')

        sbot.metafeeds.create(null, {}, (err, mf) => {
          t.error(err, 'no err for create(null, ...)')
          t.equals(mf.seed.toString('hex'), originalSeed, 'same seed')
          t.equals(mf.keys.id, originalID, 'same ID')

          sbot.metafeeds.filter(null, null, (err, allFound) => {
            t.equals(
              allFound.length,
              1,
              'got root metafeed without creating it'
            )
            t.end()
          })
        })
      })
    })
  })
})

tape('find() and filter() when there is a root metafeed', (t) => {
  sbot.metafeeds.filter(null, null, (err, allFound) => {
    t.error(err, 'no err filtering root metafeed')
    t.equals(allFound.length, 1, '1 root metafeed filtered')
    const mf = allFound[0]
    t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
    t.equals(typeof mf.keys.id, 'string', 'key seems okay')

    sbot.metafeeds.find(null, null, (err, mf) => {
      t.error(err, 'no err finding root metafeed')
      t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
      t.equals(typeof mf.keys.id, 'string', 'key seems okay')
      t.end()
    })
  })
})

tape('findOrCreate() a sub feed', (t) => {
  sbot.metafeeds.findOrCreate(null, null, {}, (err, mf) => {
    t.error(err, 'no err')

    sbot.metafeeds.find(
      mf,
      (f) => f.feedpurpose === 'chess',
      (err, found) => {
        t.error(err, 'no err')
        t.notOk(found, 'no chess subfeed found')

        // lets create a new chess feed
        sbot.metafeeds.findOrCreate(
          mf,
          (f) => f.feedpurpose === 'chess',
          { feedpurpose: 'chess', feedformat: 'classic' },
          (err, feed) => {
            // t.equals(mf.feeds.length, 2, '2 sub feeds in the root metafeed')
            t.error(err, 'no err')
            t.equals(feed.feedpurpose, 'chess', 'it is the chess feed')

            sbot.metafeeds.filter(mf, null, (err, filtered) => {
              t.error(err, 'no err')
              t.equals(filtered.length, 2, '2 sub feeds in the root metafeed')
              t.equals(filtered[0].feedpurpose, 'main', 'the main')
              t.equals(filtered[1].feedpurpose, 'chess', 'the chess')
              t.end()
            })
          }
        )
      }
    )
  })
})

test('restart sbot', (t) => {
  sbot.close(true, () => {
    sbot = SecretStack({ appKey: caps.shs })
      .use(require('ssb-db2'))
      .use(require('../'))
      .call(null, {
        keys: mainKey,
        path: dir,
      })

    sbot.metafeeds.findOrCreate(null, null, {}, (err, mf) => {
      t.error(err, 'no err')
      t.ok(Buffer.isBuffer(mf.seed), 'has seed')
      t.ok(mf.keys.id.endsWith('.bbfeed-v1'), 'has key')
      // FIXME: assert living and tombstoned somehow
      // t.equal(mf.feeds.length, 2, 'has 2 feeds')
      // t.equal(mf.feeds[0].feedpurpose, 'main', 'main')
      // t.equal(mf.feeds[1].feedpurpose, 'chess', 'chess')
      // t.equal(mf.tombstoned.length, 0, 'has 0 tombstoned feeds')
      // t.ok(mf.latest.key.endsWith('.bbmsg-v1'), 'latest ok')
      sbot.close(t.end)
    })
  })
})
