// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const { author, where, toCallback } = require('ssb-db2/operators')
const { promisify: p } = require('util')
const Testbot = require('./testbot.js')

/* Helpers */

function testReadAndPersisted(t, sbot, testRead) {
  const { path } = sbot.config

  testRead(t, sbot, (err) => {
    t.error(err, 'no error')

    console.log('> persistence')

    sbot.close(() => {
      sbot = Testbot({ path, rimraf: false })
      testRead(t, sbot, (err) => {
        t.error(err, 'no error')
        sbot.close(true, t.end)
      })
    })
  })
}

/* Tests */

test('advanced.getRoot() when there is nothing', (t) => {
  const sbot = Testbot()
  sbot.metafeeds.advanced.getRoot((err, found) => {
    t.error(err, 'no err for find()')
    t.notOk(found, 'nothing found')
    sbot.close(true, t.end)
  })
})

test('advanced.findOrCreate(null, null, null, cb)', (t) => {
  const sbot = Testbot()
  sbot.db.query(
    where(author(sbot.id)),
    toCallback((err, msgs) => {
      if (err) throw err
      t.equals(msgs.length, 0, 'empty db')

      sbot.metafeeds.advanced.findOrCreate(null, null, null, (err, mf) => {
        t.error(err, 'no err for findOrCreate()')
        // t.equals(mf.feeds.length, 1, '1 sub feed in the root metafeed')
        // t.equals(mf.feeds[0].feedpurpose, 'main', 'it is the main feed')
        t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
        t.equals(typeof mf.keys.id, 'string', 'key seems okay')
        sbot.close(true, t.end)
      })
    })
  )
})

test('advanced.findOrCreate(cb)', (t) => {
  const sbot = Testbot()

  sbot.metafeeds.advanced.findOrCreate((err, mf) => {
    t.error(err, 'no err for findOrCreate()')
    // t.equals(mf.feeds.length, 1, '1 sub feed in the root metafeed')
    // t.equals(mf.feeds[0].feedpurpose, 'main', 'it is the main feed')
    t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
    t.equals(typeof mf.keys.id, 'string', 'key seems okay')
    sbot.close(true, t.end)
  })
})

test('advanced.findOrCreate is idempotent', (t) => {
  const sbot = Testbot()
  sbot.metafeeds.advanced.findOrCreate(null, null, null, (err, mf) => {
    t.error(err, 'no err for findOrCreate()')
    t.ok(mf, 'got a metafeed')
    sbot.metafeeds.advanced.getRoot((err, mf) => {
      t.error(err, 'no err for getRoot()')
      t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
      t.equals(typeof mf.keys.id, 'string', 'key seems okay')
      const originalSeed = mf.seed.toString('hex')
      const originalID = mf.keys.id

      sbot.metafeeds.advanced.findOrCreate((err, mf) => {
        t.error(err, 'no err for findOrCreate(null, ...)')
        t.equals(mf.seed.toString('hex'), originalSeed, 'same seed')
        t.equals(mf.keys.id, originalID, 'same ID')

        sbot.close(true, t.end)
      })
    })
  })
})

test('advanced.findOrCreate() a sub feed', (t) => {
  const sbot = Testbot()
  sbot.metafeeds.advanced.findOrCreate(null, null, null, (err, mf) => {
    sbot.metafeeds.advanced.getRoot((err, mf) => {
      t.error(err, 'gets rootFeed')

      // lets create a new chess feed
      sbot.metafeeds.advanced.findOrCreate(
        mf,
        (f) => f.feedpurpose === 'chess',
        {
          feedpurpose: 'chess',
          feedformat: 'classic',
          metadata: { score: 0 },
        },
        (err, feed) => {
          t.equals(feed.feedpurpose, 'chess', 'it is the chess feed')
          t.equals(feed.metadata.score, 0, 'it has metadata')
          sbot.close(true, t.end)
        }
      )
    })
  })
})

test('all FeedDetails have same format', (t) => {
  const sbot = Testbot()
  sbot.metafeeds.advanced.findOrCreate(null, null, null, (err, mf) => {
    if (err) throw err
    sbot.metafeeds.advanced.getRoot((err, mf) => {
      if (err) throw err
      sbot.metafeeds.advanced.findOrCreate(
        null,
        () => true,
        {},
        (err, _mf) => {
          if (err) throw err

          t.deepEquals(
            mf,
            _mf,
            'getRoot and findOrCreate return the same root FeedDetails'
          )

          sbot.metafeeds.advanced.findOrCreate(
            mf,
            (f) => f.feedpurpose === 'chess',
            {
              feedpurpose: 'chess',
              feedformat: 'classic',
              metadata: { score: 0 },
            },
            (err, feed) => {
              t.deepEquals(
                Object.keys(mf).sort(),
                Object.keys(feed).sort(),
                'root & chess FeedDetails have same data structure'
              )
              sbot.close(true, t.end)
            }
          )
        }
      )
    })
  })
})

test('advanced.findOrCreate() a subfeed under a sub meta feed', (t) => {
  const sbot = Testbot()
  sbot.metafeeds.advanced.findOrCreate(null, null, null, (err, rootMF) => {
    sbot.metafeeds.advanced.findOrCreate(
      rootMF,
      (f) => f.feedpurpose === 'indexes',
      { feedpurpose: 'indexes', feedformat: 'bendybutt-v1' },
      (err, indexesMF) => {
        t.error(err, 'no err')
        t.equals(indexesMF.feedpurpose, 'indexes', 'got the indexes meta feed')
        t.true(
          indexesMF.subfeed.startsWith('ssb:feed/bendybutt-v1/'),
          'has a bendy butt SSB URI'
        )

        sbot.metafeeds.advanced.findOrCreate(
          indexesMF,
          (f) => f.feedpurpose === 'index',
          {
            feedpurpose: 'index',
            feedformat: 'indexed-v1',
            metadata: { query: 'foo' },
          },
          (err, f) => {
            t.error(err, 'no err')
            t.equals(f.feedpurpose, 'index', 'it is the index subfeed')
            t.equals(f.metadata.query, 'foo', 'query is okay')
            t.true(
              f.subfeed.startsWith('ssb:feed/indexed-v1/'),
              'feed format is indexed-v1'
            )

            sbot.close(true, t.end)
          }
        )
      }
    )
  })
})

// Mock a metafeed tree of shape:
//   root
//     - chess
//     - indexes
//        - about
async function setupTree(sbot) {
  const rootMF = await p(sbot.metafeeds.advanced.findOrCreate)()
  const chessF = await p(sbot.metafeeds.advanced.findOrCreate)(
    rootMF,
    (f) => f.feedpurpose === 'chess',
    {
      feedpurpose: 'chess',
      feedformat: 'classic',
      metadata: { score: 0 },
    }
  )
  const indexesMF = await p(sbot.metafeeds.advanced.findOrCreate)(
    rootMF,
    (f) => f.feedpurpose === 'indexes',
    { feedpurpose: 'indexes', feedformat: 'bendybutt-v1' }
  )
  const indexF = await p(sbot.metafeeds.advanced.findOrCreate)(
    indexesMF,
    (f) => f.feedpurpose === 'index',
    {
      feedpurpose: 'index',
      feedformat: 'indexed-v1',
      metadata: { query: 'foo' },
    }
  )

  return { rootMF, chessF, indexesMF, indexF }
}

test('advanced.findById', (t) => {
  const sbot = Testbot()

  setupTree(sbot).then(({ indexF, indexesMF }) => {
    sbot.metafeeds.advanced.findById(null, (err, details) => {
      t.match(err.message, /feedId should be provided/, 'error about feedId')
      t.notOk(details)

      testReadAndPersisted(t, sbot, (t, sbot, cb) => {
        sbot.metafeeds.advanced.findById(indexF.keys.id, (err, details) => {
          if (err) return cb(err)

          t.deepEquals(Object.keys(details), [
            'feedformat',
            'feedpurpose',
            'metafeed',
            'metadata',
          ])
          t.equals(details.feedpurpose, 'index')
          t.equals(details.metafeed, indexesMF.keys.id)
          t.equals(details.feedformat, 'indexed-v1')

          cb(null)
        })
      })
    })
  })
})

test('branchStream', (t) => {
  const sbot = Testbot()

  function testRead(t, sbot, cb) {
    pull(
      sbot.metafeeds.branchStream({ old: true, live: false }),
      pull.collect((err, branches) => {
        if (err) return cb(err)

        t.equal(branches.length, 5, '5 branches')

        t.equal(branches[0].length, 1, 'root mf alone')
        t.equal(typeof branches[0][0][0], 'string', 'root mf alone')
        t.deepEqual(
          branches[0][0][1],
          {
            feedformat: 'bendybutt-v1',
            feedpurpose: 'root',
            metafeed: null,
            metadata: {},
          },
          'root mf alone'
        )

        t.equal(branches[1].length, 2, 'main branch')
        t.equal(branches[1][1][1].feedpurpose, 'main', 'main branch')

        t.equal(branches[2].length, 2, 'chess branch')
        t.equal(branches[2][1][1].feedpurpose, 'chess', 'chess branch')

        t.equal(branches[3].length, 2, 'indexes branch')
        t.equal(branches[3][1][1].feedpurpose, 'indexes', 'indexes branch')

        t.equal(branches[4].length, 3, 'index branch')
        t.equal(branches[4][2][1].feedpurpose, 'index', 'indexes branch')

        cb(null)
      })
    )
  }

  setupTree(sbot).then(() => {
    testReadAndPersisted(t, sbot, testRead)
  })
})

test('advanced.findAndTombstone and tombstoning branchStream', (t) => {
  const sbot = Testbot()

  setupTree(sbot).then(({ rootMF }) => {
    pull(
      sbot.metafeeds.branchStream({
        tombstoned: true,
        old: false,
        live: true,
      }),
      pull.drain((branch) => {
        t.equals(branch.length, 2, 'live')
        t.equals(branch[0][0], rootMF.keys.id, 'live')
        t.equals(branch[1][1].feedpurpose, 'chess', 'live')
        t.equals(branch[1][1].reason, 'This game is too good', 'live')

        function testRead(t, sbot, cb) {
          pull(
            sbot.metafeeds.branchStream({
              tombstoned: true,
              old: true,
              live: false,
            }),
            pull.drain((branch) => {
              t.equals(branch.length, 2)
              t.equals(branch[0][0], rootMF.keys.id, 'tombstoned: true')
              t.equals(branch[1][1].feedpurpose, 'chess', 'tombstoned: true')
              t.equals(
                branch[1][1].reason,
                'This game is too good',
                'tombstoned: true'
              )

              pull(
                sbot.metafeeds.branchStream({
                  tombstoned: false,
                  old: true,
                  live: false,
                }),
                pull.collect((err, branches) => {
                  if (err) return cb(err)
                  t.equal(branches.length, 4, 'tombstoned: false')

                  pull(
                    sbot.metafeeds.branchStream({
                      tombstoned: null,
                      old: true,
                      live: false,
                    }),
                    pull.collect((err, branches) => {
                      if (err) return cb(err)
                      t.equal(branches.length, 5, 'tombstoned: null')
                      cb(null)
                    })
                  )
                })
              )
            })
          )
        }

        testReadAndPersisted(t, sbot, testRead)
      })
    )

    sbot.metafeeds.advanced.findAndTombstone(
      rootMF,
      (f) => f.feedpurpose === 'chess',
      'This game is too good',
      (err) => {
        t.error(err, 'no err')
      }
    )
  })
})

test('advanced.findOrCreate (metadata.recps)', (t) => {
  const sbot = Testbot()

  const ownKey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.setOwnDMKey(ownKey)

  testReadAndPersisted(t, sbot, (t, sbot, cb) => {
    sbot.metafeeds.advanced.findOrCreate((err, mf) => {
      if (err) return cb(err)
      sbot.metafeeds.advanced.findOrCreate(
        mf,
        (f) => f.feedpurpose === 'private',
        {
          feedpurpose: 'private',
          feedformat: 'classic',
          metadata: {
            recps: [sbot.id],
          },
        },
        (err, f) => {
          if (err) return cb(err)
          t.equal(f.feedpurpose, 'private')
          t.equal(f.metadata.recps[0], sbot.id)
          cb(null)
        }
      )
    })
  })
})

// SUGARY top level APIs

test('findOrCreate', (t) => {
  const sbot = Testbot()

  const details = {
    feedpurpose: 'chess',
    // feedformat: 'classic', optional
  }

  sbot.metafeeds.findOrCreate(details, (err, chessF) => {
    if (err) throw err
    t.equal(chessF.feedpurpose, details.feedpurpose, 'creates feed')

    sbot.metafeeds.findOrCreate(details, (err, chessF2) => {
      if (err) throw err
      t.deepEqual(chessF, chessF2, 'finds feed')

      pull(
        sbot.metafeeds.branchStream({ root: null, old: true, live: false }),
        pull.collect((err, branches) => {
          if (err) throw err

          t.equal(branches.length, 5, 'correct number of feeds created')
          // root, v1, shard, chess (AND MAIN)

          const purposePath = branches
            .pop()
            .map((f) => f[1] && f[1].feedpurpose)
          t.deepEqual(purposePath, [null, 'v1', purposePath[2], 'chess'])
          // TODO it would be nice for testing that we could deterministically know the shard
          // but I don't know how to fix the "seed" that the root feed is derived from

          sbot.close(true, t.end)
        })
      )
    })
  })
})

test('findOrCreate (metadata.recps)', (t) => {
  const sbot = Testbot()

  const ownKey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.setOwnDMKey(ownKey)

  const details = {
    feedpurpose: 'chess',
    metadata: {
      recps: [sbot.id],
    },
  }

  sbot.metafeeds.findOrCreate(details, (err, chessF) => {
    if (err) throw err

    t.deepEqual(chessF.metadata.recps, [sbot.id], 'creates encrypted subfee')
    sbot.close(true, t.end)
  })
})

test('findAndTombstone', (t) => {
  const sbot = Testbot()

  const details = {
    feedpurpose: 'chess',
  }

  sbot.metafeeds.findOrCreate(details, (err, chessF) => {
    t.error(err, 'no error')

    sbot.metafeeds.findAndTombstone(details, 'stupid game', (err, success) => {
      t.error(err, 'no error')
      t.true(success, 'tombstone success')

      pull(
        sbot.metafeeds.branchStream({
          old: true,
          live: false,
          tombstoned: false,
        }),
        pull.map((branch) =>
          branch.map((el) => (el[1] ? el[1].feedpurpose : null))
        ),
        pull.collect((err, branches) => {
          t.error(err, 'no error')

          t.true(
            branches.every((branch) => !branch.includes('chess')),
            'gone from branchStream'
          )

          sbot.close(true, t.end)
        })
      )
    })
  })
})
