// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const { author, where, type, toCallback } = require('ssb-db2/operators')
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
        (f) => f.purpose === 'chess',
        {
          purpose: 'chess',
          feedFormat: 'classic',
          metadata: { score: 0 },
        },
        (err, feed) => {
          t.equals(feed.purpose, 'chess', 'it is the chess feed')
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
      (f) => f.purpose === 'indexes',
      { purpose: 'indexes', feedFormat: 'bendybutt-v1' },
      (err, indexesMF) => {
        t.error(err, 'no err')
        t.equals(indexesMF.purpose, 'indexes', 'got the indexes meta feed')
        t.true(
          indexesMF.id.startsWith('ssb:feed/bendybutt-v1/'),
          'has a bendy butt SSB URI'
        )

        sbot.metafeeds.advanced.findOrCreate(
          indexesMF,
          (f) => f.purpose === 'index',
          {
            purpose: 'index',
            feedFormat: 'indexed-v1',
            metadata: { query: 'foo' },
          },
          (err, f) => {
            t.error(err, 'no err')
            t.equals(f.purpose, 'index', 'it is the index subfeed')
            t.equals(f.metadata.query, 'foo', 'query is okay')
            t.true(
              f.id.startsWith('ssb:feed/indexed-v1/'),
              'feed format is indexed-v1'
            )

            sbot.close(true, t.end)
          }
        )
      }
    )
  })
})

test('advanced.findOrCreate (protected metadata fields)', (t) => {
  const sbot = Testbot()

  sbot.metafeeds.advanced.findOrCreate((err, mf) => {
    if (err) t.error(err, 'no error')

    sbot.metafeeds.advanced.findOrCreate(
      mf,
      (f) => f.purpose === 'private',
      {
        purpose: 'private',
        feedFormat: 'classic',
        metadata: {
          recps: [sbot.id], // naughty! (this is a protected field)
        },
      },
      (err, f) => {
        t.match(
          err.message,
          /metadata.recps not allowed/,
          'not allowed to use metadata.recps'
        )
        sbot.close(true, t.end)
      }
    )
  })
})

test('advanced.findOrCreate (encryption - GroupId)', (t) => {
  const sbot = Testbot()

  const groupId = '%EPdhGFkWxLn2k7kzthIddA8yqdX8VwjmhmTes0gMMqE=.cloaked'
  const groupKey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.addGroupInfo(groupId, { key: groupKey })

  testReadAndPersisted(t, sbot, (t, sbot, cb) => {
    sbot.metafeeds.advanced.findOrCreate((err, mf) => {
      if (err) t.error(err, 'no error')

      sbot.metafeeds.advanced.findOrCreate(
        mf,
        (f) => f.purpose === 'private',
        {
          purpose: 'private',
          feedFormat: 'classic',
          recps: [groupId],
          encryptionFormat: 'box2',
        },
        (err, f) => {
          if (err) t.error(err, 'no error')

          t.deepEqual(f.recps, [groupId], 'FeedDetails contains recps')

          sbot.db.query(
            where(type('metafeed/add/derived')),
            toCallback((err, anyMsgs) => {
              if (err) return cb(err)

              const msgs = anyMsgs.filter(
                (msg) => msg.value.content.feedpurpose === 'private'
              )

              t.equal(msgs.length, 1, 'only one metafeed/add/derived')
              t.deepEqual(
                msgs[0].value.content.recps,
                [groupId],
                'metafeed/add/derived has recps'
              )

              cb(null)
            })
          )
        }
      )
    })
  })
})

test('advanced.findOrCreate (encryption - FeedId)', (t) => {
  const sbot = Testbot()

  const ownKey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.setOwnDMKey(ownKey)

  sbot.metafeeds.advanced.findOrCreate((err, mf) => {
    if (err) t.error(err, 'no err')

    sbot.metafeeds.advanced.findOrCreate(
      mf,
      (f) => f.purpose === 'private',
      {
        purpose: 'private',
        feedFormat: 'classic',
        recps: [sbot.id],
        encryptionFormat: 'box2',
      },
      (err, f) => {
        t.match(
          err.message,
          /metafeed encryption currently only supports groupId/
        )
        sbot.close(true, t.end)
      }
    )
  })
})
