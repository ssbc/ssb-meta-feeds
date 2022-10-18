// SPDX-FileCopyrightText: 2022 Mix Irving
//
// SPDX-License-Identifier: Unlicense

const { promisify: p } = require('util')
const Testbot = require('./testbot.js')

function testReadAndPersisted(t, sbot, testRead) {
  const { path } = sbot.config

  testRead(t, sbot, (err) => {
    t.error(err, 'no error')

    console.log('> persistence')

    sbot.close(() => {
      sbot = Testbot({ path, rimraf: false })
      testRead(t, sbot, (err) => {
        t.error(err, 'no error')
        sbot.close(true, t.end)
      })
    })
  })
}

// Mock a metafeed tree of shape:
//   root
//     - chess
//     - indexes
//        - about
async function setupTree(sbot) {
  const rootMF = await p(sbot.metafeeds.advanced.findOrCreate)()
  const chessF = await p(sbot.metafeeds.advanced.findOrCreate)(
    rootMF,
    (f) => f.purpose === 'chess',
    {
      purpose: 'chess',
      feedFormat: 'classic',
      metadata: { score: 0 },
    }
  )
  const indexesMF = await p(sbot.metafeeds.advanced.findOrCreate)(
    rootMF,
    (f) => f.purpose === 'indexes',
    { purpose: 'indexes', feedFormat: 'bendybutt-v1' }
  )
  const indexF = await p(sbot.metafeeds.advanced.findOrCreate)(
    indexesMF,
    (f) => f.purpose === 'index',
    {
      purpose: 'index',
      feedFormat: 'indexed-v1',
      metadata: { query: 'foo' },
    }
  )

  return { rootMF, chessF, indexesMF, indexF }
}

module.exports = {
  testReadAndPersisted,
  setupTree,
}

