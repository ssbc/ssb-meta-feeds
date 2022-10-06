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

test('branchStream (encrypted announces)', (t) => {
  const sbot = Testbot()

  const groupId = '%EPdhGFkWxLn2k7kzthIddA8yqdX8VwjmhmTes0gMMqE=.cloaked'
  const groupKey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.addGroupKey(groupId, groupKey)

  const details = {
    feedpurpose: 'dental',
    recps: [groupId]
  }

  let doneCount = 0
  const donePlan = 2
  const done = () => {
    if (++doneCount === donePlan) {
      sbot.close(true, t.end)
    }
  }

  pull(
    sbot.metafeeds.branchStream({ old: false, live: true }),
    pull.drain((branch) => {
      const dentalFeed = branch.find(feed => feed[1].feedpurpose === details.feedpurpose)
      if (!dentalFeed) return

      t.equal(dentalFeed[1].feedpurpose, 'dental', 'finds encrypted feed (live)')
      t.deepEqual(dentalFeed[1].recps, [groupId], 'has recps details (live)')

      done()
    })
  )

  sbot.metafeeds.findOrCreate(details, (err, f) => {
    if (err) t.error(err, 'no error')

    const query = () => pull(
      sbot.metafeeds.branchStream({ old: true, live: false }),
      pull.collect((err, branches) => {
        if (err) t.error(err, 'no error')

        t.equal(branches.length, 5, '5 feed branches') // root, main, v1, :shard, dental
        const dentalPath = branches.pop()
        const [_, dentalFeed] = dentalPath[dentalPath.length - 1]

        t.equal(dentalFeed.feedpurpose, details.feedpurpose, 'finds encrypted feed')
        t.deepEqual(dentalFeed.recps, details.recps, 'has recps details')

        done()
      })
    )

    setTimeout(query, 500)
    // unfortunately if you run the query straight away, it fails
    // this could be because it takes a moment for indexing of encrypted messages?
    // you can see the delay by logging in lookup.js #updateLookup
  })
})
