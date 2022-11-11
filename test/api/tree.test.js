// SPDX-FileCopyrightText: 2022 Andre 'Staltz' Medeiros
//
// SPDX-License-Identifier: CC0-1.0

const test = require('tape')
const Testbot = require('../testbot')
const { setupTree } = require('../testtools')

test('getTree', (t) => {
  const ssb = Testbot()

  setupTree(ssb).then(() => {
    ssb.metafeeds.findOrCreate((err, root) => {
      t.error(err, 'no error')
      ssb.metafeeds.getTree(root.id, (err, tree) => {
        t.error(err, 'no error')
        t.equals(tree.purpose, 'root')
        t.ok(tree.keys, 'root keys')
        t.ok(tree.seed, 'root seed')
        t.equals(tree.recps, null, 'root recps')
        t.equals(tree.tombstoned, false, 'root tombstoned')
        t.equals(tree.tombstoneReason, null, 'root tombstoneReason')
        t.equals(tree.children[0].purpose, 'v1')
        t.equals(tree.children[0].children[0].purpose, '2')
        t.equals(tree.children[0].children[0].children[0].purpose, 'main')
        t.equals(tree.children[1].purpose, 'chess')
        t.equals(tree.children[2].purpose, 'indexes')
        t.equals(tree.children[2].children[0].purpose, 'index')
        ssb.close(true, t.end)
      })
    })
  })
})

test('printTree simple', (t) => {
  const ssb = Testbot()

  setupTree(ssb).then(() => {
    ssb.metafeeds.findOrCreate((err, root) => {
      t.error(err, 'no error')

      const originalConsoleLog = console.log
      const logged = []
      console.log = (str) => {
        logged.push(str)
      }
      ssb.metafeeds.printTree(root.id, null, (err, x) => {
        console.log = originalConsoleLog

        t.error(err, 'no error')
        t.notOk(x, 'no return value')
        t.equals(logged.length, 7)
        const actual = logged.join('\n')
        const expected = `root
├─┬ v1
│ └─┬ 2
│   └── main
├── chess
└─┬ indexes
  └── index`
        t.equals(actual, expected)
        ssb.close(true, t.end)
      })
    })
  })
})

test('printTree with id', (t) => {
  const ssb = Testbot()

  setupTree(ssb).then(() => {
    ssb.metafeeds.findOrCreate((err, root) => {
      t.error(err, 'no error')

      const originalConsoleLog = console.log
      const logged = []
      console.log = (str) => {
        logged.push(str)
      }
      ssb.metafeeds.printTree(root.id, { id: true }, (err, x) => {
        console.log = originalConsoleLog

        t.error(err, 'no error')
        t.notOk(x, 'no return value')
        t.equals(logged.length, 7)
        t.true(logged[0].includes('root'))
        t.true(logged[0].includes('ssb:feed/bendybutt-v1/'))

        t.true(logged[1].includes('v1'))
        t.true(logged[1].includes('ssb:feed/bendybutt-v1/'))

        t.true(logged[2].includes('2'))
        t.true(logged[2].includes('ssb:feed/bendybutt-v1/'))

        t.true(logged[3].includes('main'))
        t.true(logged[3].includes('@'))

        t.true(logged[4].includes('chess'))
        t.true(logged[4].includes('@'))

        t.true(logged[5].includes('indexes'))
        t.true(logged[5].includes('ssb:feed/bendybutt-v1/'))

        t.true(logged[6].includes('index'))
        t.true(logged[6].includes('ssb:feed/indexed-v1/'))

        ssb.close(true, t.end)
      })
    })
  })
})
