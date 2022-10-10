// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const Testbot = require('../../testbot')

test('advanced.getRoot() when there is nothing', (t) => {
  const sbot = Testbot()
  sbot.metafeeds.advanced.getRoot((err, found) => {
    t.error(err, 'no err for find()')
    t.notOk(found, 'nothing found')
    sbot.close(true, t.end)
  })
})

// tests getRoot + findOrCreate(cb) + findOrCreate(root, isFeed, details, cb)

test('advanced.getRoot (all FeedDetails have same format)', (t) => {
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
            (f) => f.purpose === 'chess',
            {
              purpose: 'chess',
              feedFormat: 'classic',
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
