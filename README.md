# SSB meta feeds

An implementation of the [ssb meta feed spec] in JS as a secret stack
plugin.

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

## messages

Helper functions related to generating messages

### generateAnnounceMsg(metafeedKey, sbot, cb)

Generate a message to be posted on your main feed linking to a meta
feed.

```js
sbot.metafeeds.messages.generateAnnounceMsg(mfKey, (err, announceMsg) => {
  sbot.db.publish(announceMsg, (err) => {
    console.log("main feed is now linked to meta feed")
  })
})
```

### generateSeedSaveMsg(metafeedId, mainId, seed)

Generate a message to save your seed value as a private message.

```js
const seedSaveMsg = sbot.metafeeds.messages.generateSeedSaveMsg(mfKey.id, sbot.id, seed)
sbot.db.publish(seedSaveMsg, (err) => {
  console.log("seed has now been saved, all feed keys generated from this can be restored from the seed")
})
```

## query

### getSeed(cb)

Gets the stored seed message.

```js
let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-meta-feeds'))
  .use(require('ssb-db2'))
  .call(null, {
    keys,
    path: dir,
  })

sbot.metafeeds.query.getSeed((err, seed) => {
  console.log("seed buffer", seed)
})
```

### getMetadata(feedId, cb)

Gets the metafeed message for a given feed to look up metadata.

```js
let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-meta-feeds'))
  .use(require('ssb-db2'))
  .call(null, {
    keys,
    path: dir,
  })

sbot.metafeeds.query.getMetadata(indexKey.id, (err, content) => {
  console.log("query used for index feed", JSON.parse(content.query))
})
```

### hydrate(feedId, cb)

Gets the current state (active feeds) of a meta feed.

```js
let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-meta-feeds'))
  .use(require('ssb-db2'))
  .call(null, {
    keys,
    path: dir,
  })

sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
  console.log(hydrated.feeds) // the feeds
  console.log(hydrated.feeds[0].feedpurpose) // 'main'
})
```

[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
