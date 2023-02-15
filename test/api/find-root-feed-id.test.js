// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const Testbot = require('../testbot')

test('findRootFeedId always finds root feed id', (t) => {
  const ssb = Testbot()

  ssb.metafeeds.findOrCreate((err, { id: rootFeedId }) => {
    t.error(err)

    ssb.metafeeds.findOrCreate({ purpose: 'chess' }, (err, chessFeed) => {
      t.error(err)

      ssb.metafeeds.findRootFeedId(chessFeed.id, (err, foundRootId) => {
        t.error(err)

        t.equals(
          foundRootId,
          rootFeedId,
          'found root feed id from content feed id'
        )

        ssb.metafeeds.advanced.findById(chessFeed.parent, (err, shardFeed) => {
          t.error(err)
          ssb.metafeeds.findRootFeedId(shardFeed.id, (err, foundRootId) => {
            t.error(err)

            t.equals(
              foundRootId,
              rootFeedId,
              'found root feed id from shard feed id'
            )

            ssb.metafeeds.advanced.findById(shardFeed.parent, (err, v1Feed) => {
              t.error(err)
              ssb.metafeeds.findRootFeedId(v1Feed.id, (err, foundRootId) => {
                t.error(err)

                t.equals(
                  foundRootId,
                  rootFeedId,
                  'found root feed id from v1 feed id'
                )

                ssb.metafeeds.findRootFeedId(
                  v1Feed.parent,
                  (err, foundRootId) => {
                    t.error(err)

                    t.equals(
                      foundRootId,
                      v1Feed.parent,
                      'inputting root id gives root id back'
                    )
                    t.equals(
                      foundRootId,
                      rootFeedId,
                      'found root feed id from root feed id'
                    )

                    ssb.close(true, t.end)
                  }
                )
              })
            })
          })
        })
      })
    })
  })
})
