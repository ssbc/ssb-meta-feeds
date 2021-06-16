# SSB meta feeds

An implementation of the [ssb meta feed spec] in JS as a secret stack
plugin.

```js
let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-meta-feeds')) // <-- load before db2
  .use(require('ssb-db2'))
  .call(null, {
    keys,
    path: dir,
  })
```

## keys

Operations related to keys

### generateSeed()

Generate a seed value that can be used to derive feeds

### deriveFeedKeyFromSeed(seed, label, feedformat)

Derive a new feed key from a seed. Label must be either `metafeed` for
the top level meta feed or a base64 encoded nonce. Feedformat can be
either `bendy butt` for a meta feed or `classic`.

```js
const seed = sbot.metafeeds.keys.generateSeed()
const mfKey = sbot.metafeeds.keys.deriveFeedKeyFromSeed(seed, 'metafeed')
```

## metafeed

Helper functions related to creating messages for a meta feed

### addExisting(feedpurpose, previous, sfKeys, mfKeys, metadata)

Generate a message linking an existing feed (sfKeys) to a meta
feed. Previous is the previous message on the meta feed in key value
form. `metatada` is an optional dict.

```js
const msg = sbot.metafeeds.metafeed.add('main', null, mainKeys, mfKeys)
```

### add(seed, feedformat, feedpurpose, previous, mfKeys, metadata)

Generate a message to be posted on meta feed linking feed to a meta
feed. Similar to `deriveFeedKeyFromSeed`, `feedformat` can be either
`bendy butt` for a meta feed or `classic`. `metatada` is an optional
dict.

```js
const msg = sbot.metafeeds.metafeed.add(seed, 'classic', 'main', null, mfKeys)
```

### tombstone(previous, sfKeys, mfKeys, reason, cb)

Generate a message to be posted on meta feed tombstoning a feed on a
meta feed.

```js
const previous = {
  key: '%vv/XLo8lYgFjX9sM44I5F6la2FAp6iREuZ0AVJFp0pU=.bbmsg-v1',
  value: {
    previous: '%jv9hs2es5Pkw85vSOmLvzQh4HtosbCrVjhT+fR6GPr4=.bbmsg-v1',
    ...
  }
}

sbot.metafeeds.metafeed.tombstone(previous, mainKeys, mfKeys, 'No longer used', (err, tombstoneMsg) => {
  sbot.db.publishAs(mfKey, tombstoneMsg, (err) => {
    console.log("main is now tombstoned on meta feed")
  })
})
```

## mainfeed

Helper functions related to generating messages for the main feed

### generateAnnounceMsg(mfKeys, cb)

Generate a message to be posted on your main feed linking to a meta
feed.

```js
sbot.metafeeds.messages.generateAnnounceMsg(mfKey, (err, announceMsg) => {
  sbot.db.publish(announceMsg, (err) => {
    console.log("main feed is now linked to meta feed")
  })
})
```

### generateSeedSaveMsg(metafeedId, seed)

Generate a message to save your seed value as a private message.

```js
const seedSaveMsg = sbot.metafeeds.messages.generateSeedSaveMsg(mfKey.id, seed)
sbot.db.publish(seedSaveMsg, (err) => {
  console.log("seed has now been saved, all feed keys generated from this can be restored from the seed")
})
```

## query

### getSeed(cb)

Gets the stored seed message.

```js
sbot.metafeeds.query.getSeed((err, seed) => {
  console.log("seed buffer", seed)
})
```

### getAnnounce(cb)

Gets the meta feed announce message on main feed.

```js
sbot.metafeeds.query.getAnnounce((err, msg) => {
  console.log("announce msg", msg)
})
```

### getMetadata(feedId, cb)

Gets the metafeed message for a given feed to look up metadata.

```js
sbot.metafeeds.query.getMetadata(indexKey.id, (err, content) => {
  console.log("query used for index feed", JSON.parse(content.query))
})
```

### hydrate(feedId, seed, cb)

Gets the current state (active feeds) of a meta feed.

```js
sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
  console.log(hydrated.feeds) // the feeds
  console.log(hydrated.feeds[0].feedpurpose) // 'main'
})
```

[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
