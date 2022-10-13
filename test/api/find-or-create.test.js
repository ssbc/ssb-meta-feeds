// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const p = require('util').promisify
const { where, type, toPromise } = require('ssb-db2/operators')
const Testbot = require('../testbot')

test('findOrCreate with no details gives us the root', (t) => {
  const ssb = Testbot()
  ssb.metafeeds.findOrCreate((err, feed) => {
    t.error(err)
    t.equal(feed.feedpurpose, 'root', 'feedpurpose is correct')
    t.equal(feed.metafeed, null, 'metafeed is empty')
    t.equal(feed.feedformat, 'bendybutt-v1', 'feedformat is correct')
    ssb.close(true, t.end)
  })
})

test('metafeed tree from findOrCreate has root/v1/:shard/main', (t) => {
  const ssb = Testbot()
  ssb.metafeeds.findOrCreate((err, feed) => {
    pull(
      ssb.metafeeds.branchStream({
        root: feed.subfeed,
        old: true,
        live: false,
      }),
      pull.filter((branch) =>
        branch.find(([id, details]) => details.feedpurpose === 'main')
      ),
      pull.collect((err, branches) => {
        t.error(err, 'no error')
        t.equal(branches.length, 1, 'only one branch for the main feed')
        const branch = branches[0]
        t.equal(branch.length, 4, 'branch has 4 nodes')
        t.equal(branch[0][1].feedpurpose, 'root', 'root is 1st')
        t.equal(branch[1][1].feedpurpose, 'v1', 'v1 is 2nd')
        t.equal(branch[2][1].feedpurpose.length, 1, 'shard is 3rd')
        t.equal(branch[3][1].feedpurpose, 'main', 'main is 4th')
        ssb.close(true, t.end)
      })
    )
  })
})

test('findOrCreate', (t) => {
  const sbot = Testbot()

  const details = {
    feedpurpose: 'chess',
    // feedformat: 'classic', optional
  }

  sbot.metafeeds.findOrCreate(details, (err, chessF) => {
    if (err) throw err
    t.equal(chessF.feedpurpose, details.feedpurpose, 'creates feed')

    sbot.metafeeds.findOrCreate(details, (err, chessF2) => {
      if (err) throw err
      t.deepEqual(chessF, chessF2, 'finds feed')

      pull(
        sbot.metafeeds.branchStream({ root: null, old: true, live: false }),
        pull.collect((err, branches) => {
          if (err) throw err

          t.true(
            branches.length === 5 || branches.length === 6,
            'correct number of feeds created'
          )
          // root
          // root/v1
          // root/v1/:shardA
          // root/v1/:shardA/main
          // root/v1/:shardB
          // root/v1/:shardB/chess
          // ... sometimes :shardA === :shardB !

          const purposePath = branches
            .pop()
            .map((f) => f[1] && f[1].feedpurpose)
          t.deepEqual(
            purposePath,
            ['root', 'v1', purposePath[2], 'chess'],
            'root/v1/:shard/chess branch exists'
          )
          // TODO it would be nice for testing that we could deterministically know the shard
          // but I don't know how to fix the "seed" that the root feed is derived from

          sbot.close(true, t.end)
        })
      )
    })
  })
})

test('double findOrCreate should not create two v1 feeds', async (t) => {
  const ssb = Testbot()

  const [chessF1, chessF2] = await Promise.all([
    p(ssb.metafeeds.findOrCreate)({ feedpurpose: 'chess' }),
    p(ssb.metafeeds.findOrCreate)({ feedpurpose: 'chess' }),
  ])
  t.ok(chessF1, 'chess feed created')
  t.ok(chessF2, 'second chess feed created')
  t.deepEqual(chessF1, chessF2, 'same feed')

  const msgs = await ssb.db.query(
    where(type('metafeed/add/derived')),
    toPromise()
  )
  const v1Announcements = msgs.filter(
    (msg) => msg.value.content.feedpurpose === 'v1'
  )
  t.equals(v1Announcements.length, 1, 'only one v1 announcement')

  const hexes = Array.from({ length: 16 }, (v, i) => i.toString(16))
  const shardAnnouncements = msgs.filter((msg) =>
    hexes.includes(msg.value.content.feedpurpose)
  )
  // sometimes :shardA and :shardB are the same, among
  // root/v1/:shardA/main and root/v1/:shardB/chess
  t.true(
    shardAnnouncements.length === 1 || shardAnnouncements.length === 2,
    'shard announcement'
  )

  const chessAnnouncements = msgs.filter(
    (msg) => msg.value.content.feedpurpose === 'chess'
  )
  t.equals(chessAnnouncements.length, 1, 'only one chess announcement')

  await p(ssb.close)(true)
})
