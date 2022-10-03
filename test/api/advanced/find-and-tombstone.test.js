// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const Testbot = require('../../testbot')
const { setupTree, testReadAndPersisted } = require('../../testtools')

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