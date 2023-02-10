// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const Testbot = require('../../testbot')
const { setupTree, testReadAndPersisted } = require('../../testtools')

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
            'id',
            'parent',
            'purpose',
            'feedFormat',
            'seed',
            'keys',
            'recps',
            'metadata',
            'tombstoned',
            'tombstoneReason',
          ])
          t.equals(details.purpose, 'index')
          t.equals(details.parent, indexesMF.keys.id)
          t.equals(details.feedFormat, 'indexed-v1')

          cb(null)
        })
      })
    })
  })
})

test('advanced.findById can find root feed', (t) => {
  const sbot = Testbot()

  sbot.metafeeds.findOrCreate((err, createdRootFeed) => {
    t.error(err, 'created root feed')

    sbot.metafeeds.advanced.findById(createdRootFeed.id, (err, rootFeed) => {
      t.error(err, "didn't error when finding root feed")

      t.equals(
        rootFeed.id,
        createdRootFeed.id,
        'found root feed with correct id'
      )
      t.equals(rootFeed.parent, null, "root feed shouldn't have parent")
      t.equals(rootFeed.purpose, 'root', 'root feed has root purpose')
      t.equals(
        rootFeed.feedFormat,
        'bendybutt-v1',
        'root feed has bendybutt format'
      )

      sbot.close(true, t.end)
    })
  })
})

test('advanced.findById can find parents of feeds', (t) => {
  const sbot = Testbot()

  const details = {
    purpose: 'wikis',
    feedFormat: 'classic',
  }

  sbot.metafeeds.findOrCreate((err, createdRootFeed) => {
    t.error(err, 'created root feed')

    sbot.metafeeds.findOrCreate(details, (err, contentFeed) => {
      t.error(err, 'created content feed')

      sbot.metafeeds.advanced.findById(contentFeed.parent, (err, shardFeed) => {
        t.error(err, 'found shard feed')

        sbot.metafeeds.advanced.findById(shardFeed.parent, (err, v1Feed) => {
          t.error(err, 'found v1 feed')

          t.equals(typeof v1Feed.id, 'string', 'v1Feed has id')
          t.equals(typeof v1Feed.parent, 'string', 'v1Feed has parent id')

          sbot.metafeeds.advanced.findById(v1Feed.parent, (err, rootFeed) => {
            t.error(err, "didn't error when finding root feed")

            t.equals(
              rootFeed.id,
              createdRootFeed.id,
              'found root feed with correct id'
            )
            t.equals(rootFeed.parent, null, "root feed shouldn't have parent")
            t.equals(rootFeed.purpose, 'root', 'root feed has root purpose')
            t.equals(
              rootFeed.feedFormat,
              'bendybutt-v1',
              'root feed has bendybutt format'
            )

            sbot.close(true, t.end)
          })
        })
      })
    })
  })
})
