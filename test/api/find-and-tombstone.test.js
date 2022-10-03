// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
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
