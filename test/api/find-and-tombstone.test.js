// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const p = require('util').promisify
const { where, type, count, toPromise } = require('ssb-db2/operators')
const Testbot = require('../testbot')

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

test('double findAndTombstone should not create two messages', async (t) => {
  const ssb = Testbot()

  const details = { feedpurpose: 'chess' }

  const chessF = await p(ssb.metafeeds.findOrCreate)(details)
  t.ok(chessF, 'chess feed created')

  try {
    await Promise.all([
      p(ssb.metafeeds.findAndTombstone)(details, 'bad game'),
      p(ssb.metafeeds.findAndTombstone)(details, 'stupid game'),
    ])
    t.fail('one of the findAndTomstone calls should have failed')
  } catch (err) {
    t.equal(err.message, 'Cannot find subfeed to tombstone', 'one call failed')
  }
  t.ok(chessF, 'chess feed tombstoned')

  const numTombstones = await ssb.db.query(
    where(type('metafeed/tombstone')),
    count(),
    toPromise()
  )
  t.equal(numTombstones, 1, 'only one tombstone message')

  await p(ssb.close)(true)
})
