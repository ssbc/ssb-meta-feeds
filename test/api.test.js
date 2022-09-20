// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const pull = require('pull-stream')
const { author, where, toPromise } = require('ssb-db2/operators')
const { promisify: p } = require('util')
const Testbot = require('./testbot.js')

test('getRoot / findOrCreate (root)', async (t) => {
  let sbot = Testbot()
  const { path } = sbot.config

  await p(sbot.metafeeds.getRoot)()
    .then((found) =>
      t.equal(found, null, 'getRoot() finds nothing in blank db')
    )
    .catch((err) => t.error(err, 'no err for getRoot()'))

  await sbot.db
    .query(where(author(sbot.id)), toPromise())
    .then((msgs) => t.equals(msgs.length, 0, 'db is empty'))
    .catch(t.error)

  const mf = await p(sbot.metafeeds.findOrCreate)().catch((err) =>
    t.error(err, 'no err for findOrCreate()')
  )

  // t.equals(mf.feeds.length, 1, '1 sub feed in the root metafeed')
  // t.equals(mf.feeds[0].feedpurpose, 'main', 'it is the main feed')
  t.equals(mf.seed.toString('hex').length, 64, 'seed length is okay')
  t.equals(typeof mf.keys.id, 'string', 'key seems okay')

  const mf2 = await p(sbot.metafeeds.findOrCreate)()
  const mf3 = await p(sbot.metafeeds.findOrCreate)(null, null, null)
  const mf4 = await p(sbot.metafeeds.getRoot)()

  t.deepEqual(mf, mf2, 'findOrCreate is is idempotent (A)')
  t.deepEqual(mf, mf3, 'findOrCreate is is idempotent (B)')
  t.deepEqual(mf, mf4, 'findOrCreate + getRoot return same mf')

  console.log('persistence')
  await p(sbot.close)()
  sbot = Testbot({ path, rimraf: false })

  const mf5 = await p(sbot.metafeeds.findOrCreate)()
  const mf6 = await p(sbot.metafeeds.getRoot)()

  t.deepEqual(mf, mf5, 'findOrCreate')
  t.deepEqual(mf, mf6, 'getRoot')

  await p(sbot.close)()
  t.end()
})

// Mock a metafeed tree of shape:
//   root
//     - chess
//     - indexes
//        - about
async function setupTree(sbot) {
  const rootMF = await p(sbot.metafeeds.findOrCreate)()
  const chessMF = await p(sbot.metafeeds.findOrCreate)(
    rootMF,
    (f) => f.feedpurpose === 'chess',
    {
      feedpurpose: 'chess',
      feedformat: 'classic',
      metadata: { score: 0 },
    }
  )
  const indexesMF = await p(sbot.metafeeds.findOrCreate)(
    rootMF,
    (f) => f.feedpurpose === 'indexes',
    { feedpurpose: 'indexes', feedformat: 'bendybutt-v1' }
  )
  const aboutMF = await p(sbot.metafeeds.findOrCreate)(
    indexesMF,
    (f) => f.feedpurpose === 'about',
    {
      feedpurpose: 'about',
      feedformat: 'classic',
      metadata: { query: 'foo' },
    }
  )

  return { rootMF, chessMF, indexesMF, aboutMF }
}

test('findOrCreate() a sub feed', async (t) => {
  const sbot = Testbot()
  const { rootMF, chessMF, indexesMF, aboutMF } = await setupTree(sbot)

  // create a new chess subfeed
  t.equals(chessMF.feedpurpose, 'chess', 'it is the chess feed')
  t.equals(chessMF.metadata.score, 0, 'it has metadata')

  // create an "indexes" meta subfeed
  t.equals(indexesMF.feedpurpose, 'indexes', 'it is the indexes subfeed')
  t.true(
    indexesMF.subfeed.startsWith('ssb:feed/bendybutt-v1/'),
    'has a bendy butt SSB URI'
  )

  // create an about subfeed under "indexes"
  t.equals(aboutMF.feedpurpose, 'about', 'it is the about index subfeed')
  t.equals(aboutMF.metadata.query, 'foo', 'query is okay')
  t.true(aboutMF.subfeed.endsWith('.ed25519'), 'is a classic feed')

  sbot.close()
  t.end()
})

test('findById', async (t) => {
  let sbot = Testbot()
  const { path } = sbot.config
  const { aboutMF } = await setupTree(sbot)

  async function testFinds(sbot) {
    await p(sbot.metafeeds.findById)(null)
      .catch((err) =>
        t.match(
          err.message,
          /feedId should be provided/,
          'findById requires feedId'
        )
      )
      .then((details) => t.error(details)) // there should be not details

    const details = await p(sbot.metafeeds.findById)(aboutMF.subfeed).catch(
      t.error
    )
    t.deepEquals(
      Object.keys(details),
      ['feedformat', 'feedpurpose', 'metafeed', 'metadata'],
      'has correct fields'
    )
    t.equals(details.feedpurpose, 'about', 'purpose')
    t.equals(details.feedformat, 'classic', 'format')
    t.equals(details.metafeed, aboutMF.metafeed, 'keys.id')
  }

  await testFinds(sbot)

  console.log('persistence')
  await p(sbot.close)()
  sbot = Testbot({ path, rimraf: false })
  await testFinds(sbot)

  sbot.close()
  t.end()
})

// NOT advanced
test('branchStream', async (t) => {
  let sbot = Testbot()
  const { path } = sbot.config

  const { indexesMF } = await setupTree(sbot)

  async function testBranchStream(sbot) {
    return new Promise((resolve, reject) => {
      pull(
        sbot.metafeeds.branchStream({ old: true, live: false }),
        pull.collect((err, branches) => {
          if (err) reject(err)

          t.equal(branches.length, 5, '5 branches')

          t.equal(branches[0].length, 1, 'root mf alone')
          t.equal(typeof branches[0][0][0], 'string', 'root mf alone')
          t.equal(branches[0][0][1], null, 'root mf alone')

          t.equal(branches[1].length, 2, 'main branch')
          t.equal(branches[1][1][1].feedpurpose, 'main', 'main branch')

          t.equal(branches[2].length, 2, 'chess branch')
          t.equal(branches[2][1][1].feedpurpose, 'chess', 'chess branch')

          t.equal(branches[3].length, 2, 'indexes branch')
          t.equal(branches[3][1][1].feedpurpose, 'indexes', 'indexes branch')

          t.equal(branches[4].length, 3, 'about branch')
          t.equal(branches[4][2][1].feedpurpose, 'about', 'indexes branch')

          pull(
            sbot.metafeeds.branchStream({
              root: indexesMF.subfeed,
              old: true,
              live: false,
            }),
            pull.collect((err, branches) => {
              if (err) reject(err)

              t.equal(branches.length, 2, '2 branches')

              t.equal(branches[0].length, 1, 'indexes branch')
              t.equal(
                branches[0][0][1].feedpurpose,
                'indexes',
                'indexes branch'
              )

              t.equal(branches[1].length, 2, 'index branch')
              t.equal(branches[1][1][1].feedpurpose, 'about', 'indexes branch')
            })
          )

          resolve()
        })
      )
    })
  }

  await testBranchStream(sbot).catch(t.error)

  console.log('persistence')
  await p(sbot.close)()
  sbot = Testbot({ path, rimraf: false })
  await testBranchStream(sbot).catch(t.error)

  sbot.close()
  t.end()
})

test('findAndTombstone and tombstoning branchStream', async (t) => {
  let sbot = Testbot()
  const { path } = sbot.config

  const { rootMF } = await setupTree(sbot)

  let todo = 3
  pull(
    sbot.metafeeds.branchStream({ tombstoned: true, old: false, live: true }),
    pull.drain((branch) => {
      t.equals(branch.length, 2, 'live')
      t.equals(branch[0][0], rootMF.keys.id, 'live')
      t.equals(branch[1][1].feedpurpose, 'chess', 'live')
      t.equals(branch[1][1].reason, 'This game is too good', 'live')

      testOldStreams(sbot)
    })
  )

  function testOldStreams(sbot) {
    pull(
      sbot.metafeeds.branchStream({ tombstoned: true, old: true, live: false }),
      pull.drain((branch) => {
        t.equals(branch.length, 2)
        t.equals(branch[0][0], rootMF.keys.id, 'tombstoned: true')
        t.equals(branch[1][1].feedpurpose, 'chess', 'tombstoned: true')
        t.equals(
          branch[1][1].reason,
          'This game is too good',
          'tombstoned: true'
        )
        todo--
      })
    )

    pull(
      sbot.metafeeds.branchStream({
        tombstoned: false,
        old: true,
        live: false,
      }),
      pull.collect((err, branches) => {
        if (err) throw err
        t.equal(branches.length, 4, 'tombstoned: false')
        todo--
      })
    )

    pull(
      sbot.metafeeds.branchStream({ tombstoned: null, old: true, live: false }),
      pull.collect((err, branches) => {
        if (err) throw err
        t.equal(branches.length, 5, 'tombstoned: null')
        todo--
      })
    )
  }

  await p(sbot.metafeeds.findAndTombstone)(
    rootMF,
    (f) => f.feedpurpose === 'chess',
    'This game is too good'
  )

  while (todo > 0) await p(setTimeout)(100)

  console.log('(persistence)')
  await p(sbot.close)()
  sbot = Testbot({ path, rimraf: false })

  todo = 3
  testOldStreams(sbot)
  while (todo > 0) await p(setTimeout)(100)

  sbot.close()
  t.end()
})

test('findOrCreate() recps', async (t) => {
  const sbot = Testbot()

  const testkey = Buffer.from(
    '30720d8f9cbf37f6d7062826f6decac93e308060a8aaaa77e6a4747f40ee1a76',
    'hex'
  )
  sbot.box2.setOwnDMKey(testkey)

  const mf = await p(sbot.metafeeds.findOrCreate)()
  const f = await p(sbot.metafeeds.findOrCreate)(
    mf,
    (f) => f.feedpurpose === 'private',
    {
      feedpurpose: 'private',
      feedformat: 'classic',
      metadata: {
        recps: [sbot.id],
      },
    }
  )

  t.equal(f.feedpurpose, 'private')
  t.equal(f.metadata.recps[0], sbot.id)
  sbot.close()
  t.end()
})
