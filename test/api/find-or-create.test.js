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
    t.equal(feed.purpose, 'root', 'feedpurpose is correct')
    t.equal(feed.parent, null, 'metafeed is empty')
    t.equal(feed.feedFormat, 'bendybutt-v1', 'feedformat is correct')
    ssb.close(true, t.end)
  })
})

test('metafeed tree from findOrCreate has root/v1/:shard/main', (t) => {
  const ssb = Testbot()
  ssb.metafeeds.findOrCreate((err, rootMF) => {
    pull(
      ssb.metafeeds.branchStream({
        root: rootMF.id,
        old: true,
        live: false,
      }),
      pull.filter((branch) =>
        branch.find((feed) => feed.purpose === 'main')
      ),
      pull.collect((err, branches) => {
        t.error(err, 'no error')
        t.equal(branches.length, 1, 'only one branch for the main feed')
        const branch = branches[0]
        t.equal(branch.length, 4, 'branch has 4 nodes')
        t.equal(branch[0].purpose, 'root', 'root is 1st')
        t.equal(branch[1].purpose, 'v1', 'v1 is 2nd')
        t.equal(branch[2].purpose.length, 1, 'shard is 3rd')
        t.equal(branch[3].purpose, 'main', 'main is 4th')
        ssb.close(true, t.end)
      })
    )
  })
})

test('findOrCreate', (t) => {
  const sbot = Testbot()

  const details = {
    purpose: 'chess',
    // feedFormat: 'classic', optional
  }

  sbot.metafeeds.findOrCreate(details, (err, chessF) => {
    if (err) throw err
    t.equal(chessF.purpose, details.purpose, 'creates feed')

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
            .map((f) => f.purpose)
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
    p(ssb.metafeeds.findOrCreate)({ purpose: 'chess' }),
    p(ssb.metafeeds.findOrCreate)({ purpose: 'chess' }),
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
