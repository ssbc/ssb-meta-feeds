// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const test = require('tape')
const ssbKeys = require('ssb-keys')
const keys = require('../keys')
const Testbot = require('./testbot')

const seed_hex =
  '4e2ce5ca70cd12cc0cee0a5285b61fbc3b5f4042287858e613f9a8bf98a70d39'
const seed = Buffer.from(seed_hex, 'hex')
const metafeedKeys = keys.deriveFeedKeyFromSeed(
  seed,
  'metafeed',
  'bendybutt-v1'
)
const mainKey = ssbKeys.generate()

test('query', (t) => {
  const sbot = Testbot({ keys: mainKey })
  const {
    db,
    metafeeds: { messages },
  } = sbot

  let indexKey
  // NOTE - these subtests are not "atomic" - db state is shared between them

  t.test('metafeed with multiple feeds', (t) => {
    const classicOpts = messages.optsForAddExisting(
      metafeedKeys,
      'main',
      mainKey
    )

    db.create(classicOpts, (err, m) => {
      const indexAddOpts = messages.optsForAddDerived(
        metafeedKeys,
        'index',
        seed,
        'indexed-v1',
        {
          query: JSON.stringify({
            op: 'and',
            data: [
              { op: 'type', data: 'contact' },
              { op: 'author', data: mainKey.id },
            ],
          }),
        }
      )

      indexKey = keys.deriveFeedKeyFromSeed(
        seed,
        indexAddOpts.content.nonce.toString('base64'),
        'indexed-v1'
      )

      db.create(indexAddOpts, (err, m) => {
        sbot.metafeeds.query.hydrate(metafeedKeys.id, seed, (err, hydrated) => {
          t.equal(hydrated.feeds.length, 2, 'multiple feeds')
          t.equal(hydrated.feeds[0].feedpurpose, 'main')
          t.equal(hydrated.feeds[0].seed, undefined, 'no seed')
          t.equal(
            hydrated.feeds[0].subfeed,
            hydrated.feeds[0].keys.id,
            'correct main keys'
          )
          t.equal(typeof hydrated.feeds[0].keys.id, 'string', 'has key')
          t.equal(hydrated.feeds[1].feedpurpose, 'index')
          t.true(Buffer.isBuffer(hydrated.feeds[1].seed), 'has seed')
          t.equal(
            hydrated.feeds[1].subfeed,
            hydrated.feeds[1].keys.id,
            'correct index keys'
          )
          t.end()
        })
      })
    })
  })

  t.test('metafeed with tombstones', (t) => {
    const reason = 'Feed no longer used'

    messages.optsForTombstone(metafeedKeys, indexKey, reason, (err, opts) => {
      db.create(opts, (err) => {
        sbot.metafeeds.query.hydrate(metafeedKeys.id, seed, (err, hydrated) => {
          t.equal(hydrated.feeds.length, 1, 'single feed')
          t.equal(hydrated.feeds[0].feedpurpose, 'main')
          t.equal(hydrated.tombstoned.length, 1, '1 tombstone')
          t.equal(hydrated.tombstoned[0].subfeed, indexKey.id, 'tombstone id')
          t.end()
        })
      })
    })
  })

  t.test('seed', (t) => {
    const opts = messages.optsForSeed(metafeedKeys.id, sbot.id, seed)
    db.create(opts, (err) => {
      sbot.metafeeds.query.getSeed((err, storedSeed) => {
        t.deepEqual(storedSeed, seed, 'correct seed')
        t.end()
      })
    })
  })

  t.test('announce', (t) => {
    messages.optsForAnnounce(metafeedKeys, mainKey, (err, opts) => {
      db.create(opts, (err, publishedAnnounce) => {
        t.error(err, 'no err')
        sbot.metafeeds.query.getAnnounces((err, announcements) => {
          t.error(err, 'no err')
          t.equals(announcements.length, 1, '1 announce message')
          const storedAnnounce = announcements[0]
          t.equal(publishedAnnounce.key, storedAnnounce.key, 'correct announce')
          sbot.close(t.end)
        })
      })
    })
  })
})
