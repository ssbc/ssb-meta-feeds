// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const Testbot = require('../testbot')
const { setupTree, testReadAndPersisted } = require('../testtools')

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
