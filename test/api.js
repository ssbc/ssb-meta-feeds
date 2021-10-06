const test = require('tape')
const ssbKeys = require('ssb-keys')
const path = require('path')
const rimraf = require('rimraf')
const pull = require('pull-stream')
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

test('getRoot() when there is nothing', (t) => {
  sbot.metafeeds.getRoot((err, found) => {
    t.error(err, 'no err for find()')
    t.notOk(found, 'nothing found')
    t.end()
  })
})

test('findOrCreate(null, ...) can create the root metafeed', (t) => {
  db.query(
    where(author(mainKey.id)),
    toCallback((err, msgs) => {
      t.equals(msgs.length, 0, 'empty db')

      sbot.metafeeds.findOrCreate(null, null, null, (err, mf) => {
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

test('findOrCreate is idempotent', (t) => {
  sbot.metafeeds.getRoot((err, mf) => {
    t.error(err, 'no err for getRoot()')
    t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
    t.equals(typeof mf.keys.id, 'string', 'key seems okay')
    const originalSeed = mf.seed.toString('hex')
    const originalID = mf.keys.id

    sbot.metafeeds.findOrCreate((err, mf) => {
      t.error(err, 'no err for findOrCreate(null, ...)')
      t.equals(mf.seed.toString('hex'), originalSeed, 'same seed')
      t.equals(mf.keys.id, originalID, 'same ID')

      t.end()
    })
  })
})

tape('findOrCreate() a sub feed', (t) => {
  sbot.metafeeds.getRoot((err, mf) => {
    t.error(err, 'no err')

    // lets create a new chess feed
    sbot.metafeeds.findOrCreate(
      mf,
      (f) => f.feedpurpose === 'chess',
      {
        feedpurpose: 'chess',
        feedformat: 'classic',
        metadata: { score: 0 },
      },
      (err, feed) => {
        t.error(err, 'no err')
        t.equals(feed.feedpurpose, 'chess', 'it is the chess feed')
        t.equals(feed.metadata.score, 0, 'it has metadata')
        t.end()
      }
    )
  })
})

tape('findOrCreate() a sub meta feed', (t) => {
  sbot.metafeeds.findOrCreate((err, mf) => {
    sbot.metafeeds.findOrCreate(
      mf,
      (f) => f.feedpurpose === 'indexes',
      { feedpurpose: 'indexes', feedformat: 'bendybutt-v1' },
      (err, f) => {
        t.error(err, 'no err')
        t.equals(f.feedpurpose, 'indexes', 'it is the indexes subfeed')
        t.true(
          f.subfeed.startsWith('ssb:feed/bendybutt-v1/'),
          'has a bendy butt SSB URI'
        )
        t.end()
      }
    )
  })
})

let testIndexesMF
let testIndexFeed

tape('findOrCreate() a subfeed under a sub meta feed', (t) => {
  sbot.metafeeds.getRoot((err, rootMF) => {
    sbot.metafeeds.findOrCreate(
      rootMF,
      (f) => f.feedpurpose === 'indexes',
      { feedpurpose: 'indexes', feedformat: 'bendybutt-v1' },
      (err, indexesMF) => {
        t.equals(indexesMF.feedpurpose, 'indexes', 'got the indexes meta feed')
        testIndexesMF = indexesMF

        sbot.metafeeds.findOrCreate(
          indexesMF,
          (f) => f.feedpurpose === 'index',
          {
            feedpurpose: 'index',
            feedformat: 'classic',
            metadata: { query: 'foo' },
          },
          (err, f) => {
            testIndexFeed = f.subfeed
            t.error(err, 'no err')
            t.equals(f.feedpurpose, 'index', 'it is the index subfeed')
            t.equals(f.metadata.query, 'foo', 'query is okay')
            t.true(f.subfeed.endsWith('.ed25519'), 'is a classic feed')

            t.end()
          }
        )
      }
    )
  })
})

test('findById and findByIdSync', (t) => {
  sbot.metafeeds.findById(null, (err, details) => {
    t.match(err.message, /feedId should be provided/, 'error about feedId')
    t.notOk(details)

    sbot.metafeeds.findById(testIndexFeed, (err, details) => {
      t.error(err, 'no err')
      t.deepEquals(Object.keys(details), [
        'feedformat',
        'feedpurpose',
        'metafeed',
        'metadata',
      ])
      t.equals(details.feedpurpose, 'index')
      t.equals(details.metafeed, testIndexesMF.keys.id)
      t.equals(details.feedformat, 'classic')

      t.throws(
        () => {
          sbot.metafeeds.findByIdSync(testIndexFeed)
        },
        /Please call loadState/,
        'findByIdSync throws'
      )

      sbot.metafeeds.loadState((err) => {
        t.error(err, 'no err')
        const details2 = sbot.metafeeds.findByIdSync(testIndexFeed)
        t.deepEquals(details2, details, 'findByIdSync same as findById')

        t.end()
      })
    })
  })
})

test('branchStream', (t) => {
  pull(
    sbot.metafeeds.branchStream({ old: true, live: false }),
    pull.collect((err, branches) => {
      t.error(err, 'no err')
      t.equal(branches.length, 5, '5 branches')

      t.equal(branches[0].length, 1, 'root mf alone')
      t.equal(typeof branches[0][0][0], 'string', 'root mf alone')
      t.equal(branches[0][0][1], null, 'root mf alone')

      t.equal(branches[1].length, 2, 'main branch')
      t.equal(branches[1][1][1].feedpurpose, 'main', 'main branch')

      t.equal(branches[2].length, 2, 'chess branch')
      t.equal(branches[2][1][1].feedpurpose, 'chess', 'chess branch')

      t.equal(branches[3].length, 2, 'indexes branch')
      t.equal(branches[3][1][1].feedpurpose, 'indexes', 'indexes branch')

      t.equal(branches[4].length, 3, 'index branch')
      t.equal(branches[4][2][1].feedpurpose, 'index', 'indexes branch')

      t.end()
    })
  )
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

    sbot.metafeeds.ensureLoaded(testIndexFeed, () => {
      const details = sbot.metafeeds.findByIdSync(testIndexFeed)
      t.equals(details.feedpurpose, 'index')
      t.equals(details.metafeed, testIndexesMF.keys.id)
      t.equals(details.feedformat, 'classic')

      sbot.metafeeds.getRoot((err, mf) => {
        t.error(err, 'no err')
        t.ok(Buffer.isBuffer(mf.seed), 'has seed')
        t.ok(mf.keys.id.startsWith('ssb:feed/bendybutt-v1/'), 'has key')

        pull(
          sbot.metafeeds.branchStream({
            root: mf.keys.id,
            old: true,
            live: false,
          }),
          pull.collect((err, branches) => {
            t.error(err, 'no err')
            t.equal(branches.length, 5, '5 branches')

            t.equal(branches[0].length, 1, 'root mf alone')
            t.equal(typeof branches[0][0][0], 'string', 'root mf alone')
            t.equal(branches[0][0][1], null, 'root mf alone')

            t.equal(branches[1].length, 2, 'main branch')
            t.equal(branches[1][1][1].feedpurpose, 'main', 'main branch')

            t.equal(branches[2].length, 2, 'chess branch')
            t.equal(branches[2][1][1].feedpurpose, 'chess', 'chess branch')

            t.equal(branches[3].length, 2, 'indexes branch')
            t.equal(branches[3][1][1].feedpurpose, 'indexes', 'indexes branch')

            t.equal(branches[4].length, 3, 'index branch')
            t.equal(branches[4][2][1].feedpurpose, 'index', 'indexes branch')

            t.end()
          })
        )
      })
    })
  })
})

tape('findAndTombstone and tombstoning branchStream', (t) => {
  sbot.metafeeds.getRoot((err, mf) => {
    pull(
      sbot.metafeeds.branchStream({ tombstoned: true, old: false, live: true }),
      pull.drain((branch) => {
        t.equals(branch.length, 2)
        t.equals(branch[0][0], mf.keys.id)
        t.equals(branch[1][1].feedpurpose, 'chess')
        t.equals(branch[1][1].reason, 'This game is too good')

        pull(
          sbot.metafeeds.branchStream({
            tombstoned: true,
            old: true,
            live: false,
          }),
          pull.drain((branch) => {
            t.equals(branch.length, 2)
            t.equals(branch[0][0], mf.keys.id)
            t.equals(branch[1][1].feedpurpose, 'chess')
            t.equals(branch[1][1].reason, 'This game is too good')

            pull(
              sbot.metafeeds.branchStream({
                tombstoned: false,
                old: true,
                live: false,
              }),
              pull.collect((err, branches) => {
                t.error(err, 'no err')
                t.equal(branches.length, 4, '4 branches')

                pull(
                  sbot.metafeeds.branchStream({
                    tombstone: null,
                    old: true,
                    live: false,
                  }),
                  pull.collect((err, branches) => {
                    t.error(err, 'no err')
                    t.equal(branches.length, 5, '5 branches')

                    t.end()
                  })
                )
              })
            )
          })
        )
      })
    )

    sbot.metafeeds.findAndTombstone(
      mf,
      (f) => f.feedpurpose === 'chess',
      'This game is too good',
      (err) => {
        t.error(err, 'no err')
      }
    )
  })
})

tape('teardown', (t) => {
  sbot.close(true, t.end)
})
