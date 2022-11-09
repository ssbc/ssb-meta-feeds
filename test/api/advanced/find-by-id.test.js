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
