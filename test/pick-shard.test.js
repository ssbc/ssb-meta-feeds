// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const Keys = require('ssb-keys')

const pickShard = require('../pick-shard')

test('pick-shard', (t) => {
  const rootFeedId = Keys.generate(null, null, 'bendybutt-v1').id

  t.equal(
    pickShard(rootFeedId, 'dog'),
    pickShard(rootFeedId, 'dog'),
    'is deterministic'
  )

  const validShards = new Set('0123456789abcdef'.split(''))
  let pass = true
  // NOTE these are all Strings
  for (let i = 0; i < 1600; i++) {
    const shard = pickShard(rootFeedId, `test-${i}`)
    if (!validShards.has(shard)) pass = false
  }
  t.equal(pass, true, 'picked shards are nibbles')

  t.end()
})
