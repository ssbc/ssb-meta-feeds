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

  sbot.metafeeds.findOrCreate({ purpose: 'chess' }, (err, chessF) => {
    t.error(err, 'no error')

    sbot.metafeeds.findAndTombstone(
      { purpose: 'chess' },
      'stupid game',
      (err, success) => {
        t.error(err, 'no error')
        t.true(success, 'tombstone success')

        pull(
          sbot.metafeeds.branchStream({
            old: true,
            live: false,
            tombstoned: false,
          }),
          pull.collect((err, branches) => {
            t.error(err, 'no error')

            t.true(
              branches.every((branch) => branch.every(fd => fd.purpose !== 'chess')),
              'gone from branchStream'
            )

            sbot.close(true, t.end)
          })
        )
      }
    )
  })
})

test('double findAndTombstone should not create two messages', async (t) => {
  const ssb = Testbot()

  const details = { purpose: 'chess' }

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
