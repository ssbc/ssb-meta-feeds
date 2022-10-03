// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const Testbot = require('../testbot')

test('findOrCreate', (t) => {
  const sbot = Testbot()

  const details = {
    feedpurpose: 'chess'
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

test('findOrCreate (metadata.recps)', (t) => {
  const sbot = Testbot()

  const ownKey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.setOwnDMKey(ownKey)

  const details = {
    feedpurpose: 'chess',
    metadata: {
      recps: [sbot.id]
    }
  }

  sbot.metafeeds.findOrCreate(details, (err, chessF) => {
    if (err) throw err

    t.deepEqual(chessF.metadata.recps, [sbot.id], 'creates encrypted subfee')
    sbot.close(true, t.end)
  })
})