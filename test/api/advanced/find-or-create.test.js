// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const { author, where, toCallback } = require('ssb-db2/operators')
const Testbot = require('../../testbot')
const { testReadAndPersisted } = require('../../testtools')

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