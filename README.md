# SSB meta feeds

An implementation of the [ssb meta feed spec] in JS as a secret stack
plugin.

```js
let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-meta-feeds')) <-- load before db2
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

### deriveFeedKeyFromSeed(seed, name)

Derive a new feed key from a seed.

```js
const seed = sbot.metafeeds.keys.generateSeed()
const mfKey = sbot.metafeeds.keys.deriveFeedKeyFromSeed(seed, 'ssb-meta-feeds-v1:metafeed')
```

## metafeed

Helper functions related to interacting with a meta feed

### add(feedformat, feedpurpose, feedKey, metafeedKey, metadata)

Generate a message to be posted on meta feed linking feed to a meta
feed. `metatada` is an optional dict.

```js
const msg = sbot.metafeeds.metafeed.add('classic', 'main', mainKey, mfKey)
```

### tombstone(feedKey, metafeedKey, reason, cb)

Generate a message to be posted on meta feed tombstoning a feed on a
meta feed.

```js
sbot.metafeeds.metafeed.tombstone(mainKey, mfKey, (err, tombstoneMsg) => {
  sbot.db.publish(tombstoneMsg, (err) => {
    console.log("main is now tombstoned on meta feed")
  })
})
```

## messages

Helper functions related to generating messages

### generateAnnounceMsg(metafeedKey, cb)

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

### hydrate(feedId, cb)

Gets the current state (active feeds) of a meta feed.

```js
sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
  console.log(hydrated.feeds) // the feeds
  console.log(hydrated.feeds[0].feedpurpose) // 'main'
})
```

[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
