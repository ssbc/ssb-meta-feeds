// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const FeedDetails = require('../FeedDetails')

test('FeedDetails.equals', (t) => {
  const buf1 = Buffer.alloc(32).fill(0)
  const fd1 = FeedDetails.fromRootSeed(buf1)
  const buf2 = Buffer.alloc(32).fill(0)
  const fd2 = FeedDetails.fromRootSeed(buf2)
  t.notEquals(buf1, buf2, 'buffers are not equal')
  t.true(fd1.equals(fd2), 'FeedDetails are equal')
  t.end()
})
