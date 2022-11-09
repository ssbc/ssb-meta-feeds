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

        t.equal(branches.length, 7, '7 branches')
        const [
          root,
          rootV1,
          rootV1Shard,
          rootV1ShardMain,
          // These are not under shards because they used the advanced API:
          rootChess,
          rootIndexes,
          rootIndexesIndex,
        ] = branches

        t.equal(root.length, 1, 'root alone')
        t.equal(typeof root[0].id, 'string', 'root alone')
        t.equal(root[0].purpose, 'root', 'root alone')
        t.equal(root[0].parent, null, 'root alone')
        t.equal(root[0].feedFormat, 'bendybutt-v1', 'root alone')
        t.deepEqual(root[0].metadata, {}, 'root alone')
        t.ok(root[0].keys, 'root has keys')

        t.equal(rootV1.length, 2, 'root/v1 length')
        t.equal(rootV1[0].purpose, 'root', 'root/v1 root')
        t.equal(rootV1[1].purpose, 'v1', 'root/v1 v1')
        t.ok(rootV1[1].keys, 'root/v1 has keys')

        t.equal(rootV1Shard.length, 3, 'root/v1/:shard length')
        t.equal(rootV1Shard[0].purpose, 'root', 'root/v1/:shard root')
        t.equal(rootV1Shard[1].purpose, 'v1', 'root/v1/:shard v1')
        t.equal(rootV1Shard[2].purpose, '2', 'root/v1/:shard shard')
        t.ok(rootV1Shard[2].keys, 'root/v1/:shard has keys')

        t.equal(rootV1ShardMain.length, 4, 'root/v1/:shard/main')
        t.equal(rootV1ShardMain[0].purpose, 'root', 'root/v1/:shard/main root')
        t.equal(rootV1ShardMain[1].purpose, 'v1', 'root/v1/:shard/main v1')
        t.equal(rootV1ShardMain[2].purpose, '2', 'root/v1/:shard/main shard')
        t.equal(rootV1ShardMain[3].purpose, 'main', 'root/v1/:shard/main main')
        t.ok(rootV1ShardMain[3].keys, 'root/v1/:shard/main has keys')

        t.equal(rootChess.length, 2, 'chess branch')
        t.equal(rootChess[1].purpose, 'chess', 'chess branch')
        t.ok(rootChess[1].keys, 'root/chess has keys')

        t.equal(rootIndexes.length, 2, 'indexes branch')
        t.equal(rootIndexes[1].purpose, 'indexes', 'indexes branch')
        t.ok(rootIndexes[1].keys, 'root/indexes has keys')

        t.equal(rootIndexesIndex.length, 3, 'index branch')
        t.equal(rootIndexesIndex[2].purpose, 'index', 'indexes branch')
        t.ok(rootIndexesIndex[2].keys, 'root/indexes/index has keys')

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
  sbot.box2.addGroupInfo(groupId, { key: groupKey })

  const details = {
    purpose: 'dental',
    recps: [groupId],
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
      const dentalFeed = branch.find((feed) => feed.purpose === 'dental')
      if (!dentalFeed) return

      t.equal(dentalFeed.purpose, 'dental', 'finds encrypted feed (live)')
      t.deepEqual(dentalFeed.recps, [groupId], 'has recps details (live)')

      done()
    })
  )

  sbot.metafeeds.findOrCreate(details, (err, f) => {
    if (err) t.error(err, 'no error')

    pull(
      sbot.metafeeds.branchStream({ old: true, live: false }),
      pull.collect((err, branches) => {
        if (err) t.error(err, 'no error')

        t.equal(branches.length, 6, '6 feed branches')
        // root
        // root/v1
        // root/v1/:shardA
        // root/v1/:shardA/main
        // root/v1/:shardB
        // root/v1/:shardB/dental
        const dentalBranch = branches.pop()
        const dentalFeed = dentalBranch[dentalBranch.length - 1]

        t.equal(dentalFeed.purpose, 'dental', 'finds encrypted feed')
        t.deepEqual(dentalFeed.recps, details.recps, 'has recps details')

        done()
      })
    )
  })
})
