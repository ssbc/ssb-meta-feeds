# SSB meta feeds

An implementation of the [ssb meta feed spec] in JS as a secret stack
plugin.

```js
let sbot = SecretStack({ appKey: caps.shs })
  .use(require('ssb-db2'))
  .use(require('ssb-meta-feeds'))
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

### getOrCreate

FIXME

## messages

Low level api for generating messages

### addExistingFeed(metafeedKeys, previous, feedpurpose, feedKeys, metadata)

Generate a message linking an existing feed to a meta feed. `Previous`
is the previous message on the meta feed in key value form. `metatada`
is an optional dict.

```js
const msg = sbot.metafeeds.messages.addExistingFeed(metafeedKeys, null, 'main', mainKeys)
```

### addNewFeed(metafeedKeys, previous, feedpurpose, seed, feedformat, metadata)

Generate a message to be posted on meta feed linking feed to a meta
feed. Similar to `deriveFeedKeyFromSeed`, `feedformat` can be either
`bendy butt` for a meta feed or `classic`. `metatada` is an optional
dict.

```js
const msg = sbot.metafeeds.messages.addNewFeed(metafeedKeys, null, 'main', seed, 'classic')
```

### tombstoneFeed(metafeedKeys, previous, feedKeys, reason, cb)

Generate a message to be posted on meta feed tombstoning a feed on a
meta feed. `Previous` is the previous message on the meta feed in key
value form.

```js
const previous = {
  key: '%vv/XLo8lYgFjX9sM44I5F6la2FAp6iREuZ0AVJFp0pU=.bbmsg-v1',
  value: {
    previous: '%jv9hs2es5Pkw85vSOmLvzQh4HtosbCrVjhT+fR6GPr4=.bbmsg-v1',
    ...
  }
}

sbot.metafeeds.messages.tombstoneFeed(metafeedKeys, previous, mainKeys, 'No longer used', (err, tombstoneMsg) => {
  sbot.db.publishAs(mfKey, tombstoneMsg, (err) => {
    console.log("main is now tombstoned on meta feed")
  })
})
```

### generateAnnounceMsg(metafeedKeys, cb)

Generate the content of a message to be published on a main feed
linking it to a meta feed.

```js
sbot.metafeeds.messages.generateAnnounceMsg(metafeedKeys, (err, announceMsg) => {
  sbot.db.publish(announceMsg, (err) => {
    console.log("main feed is now linked to meta feed")
  })
})
```

### generateSeedSaveMsg(metafeedId, mainfeedId, seed)

Generate the content of a message to save your seed value as a private
message on a main feed.

```js
const seedSaveMsg = sbot.metafeeds.messages.generateSeedSaveMsg(metafeedKeys.id, sbot.id, seed)
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
