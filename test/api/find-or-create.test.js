// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const p = require('util').promisify
const { where, type, toPromise } = require('ssb-db2/operators')
const Testbot = require('../testbot')

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

          t.equal(branches.length, 5, 'correct number of feeds created')
          // root, v1, shard, chess (AND MAIN)

          const purposePath = branches
            .pop()
            .map((f) => f[1] && f[1].feedpurpose)
          t.deepEqual(purposePath, ['root', 'v1', purposePath[2], 'chess'])
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
  t.equals(shardAnnouncements.length, 1, 'only one shard announcement')

  const chessAnnouncements = msgs.filter(
    (msg) => msg.value.content.feedpurpose === 'chess'
  )
  t.equals(chessAnnouncements.length, 1, 'only one chess announcement')

  await p(ssb.close)(true)
})
