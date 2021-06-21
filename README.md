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

## metafeed

### getOrCreate(cb)

Get or create the root metafeed.

```js
sbot.metafeeds.getOrCreate((err, mf) => {
  // lets create a new chess feed
  mf.getOrCreateFeed('chess', 'classic', (err, feed) => {
    sbot.db.publishAs(feed, {
      type: 'chess-move',
      ...
    }, (err) => {
      if (err) console.error(err)  
    }))
  })
})
```

The returned metafeed object looks like this:

```
  seed: <Buffer b7 06 b1 e1 d0 60 7d ab a9 b9 be 94 c8 b3 47 0d 8b db 85 56 43 73 0c 17 e4 d9 af 45 65 e7 3d a5>,
  keys: {
    curve: 'ed25519',
    ...
    id: '@NeX4nJURpyclNiQyuVUdlOPqy0vNywoJvyKs47dowSw=.bbfeed-v1'
  },
  feeds: [
    {
      feedpurpose: 'main',
      subfeed: '@4amQjiCKdJz9xB8JV5Ukrf9SpxK7E9+M53fk4nWvUyw=.ed25519',
      keys: {
        curve: 'ed25519',
        ....
        id: '@tMSm7lTZQs/tJFLWcyEhP7T/bp4YeqGVw+ztjD59s30=.ed25519'
      }
    }
  ],
  tombstoned: [],
  latest: {
    key: '%wn45V+UUgB0uQupjbNUEqnGz7vbepaNdZ4/Vj7AvIvo=.bbmsg-v1',
    value: {
      previous: null,
      ...
    }
  }
}
```

## Low-level API

### keys

Operations related to keys

#### generateSeed()

Generate a seed value that can be used to derive feeds

#### deriveFeedKeyFromSeed(seed, label, feedformat)

Derive a new feed key from a seed. Label must be either `metafeed` for
the top level meta feed or a base64 encoded nonce. Feedformat can be
either `bendy butt` for a meta feed or `classic`.

```js
const seed = sbot.metafeeds.keys.generateSeed()
const mfKey = sbot.metafeeds.keys.deriveFeedKeyFromSeed(seed, 'metafeed')
```

### messages

Low level api for generating messages

#### addExistingFeed(metafeedKeys, previous, feedpurpose, feedKeys, metadata)

Generate a message linking an existing feed to a meta feed. `Previous`
is the previous message on the meta feed in key value form. `metatada`
is an optional dict.

```js
const msg = sbot.metafeeds.messages.addExistingFeed(metafeedKeys, null, 'main', mainKeys)
```

#### addNewFeed(metafeedKeys, previous, feedpurpose, seed, feedformat, metadata)

Generate a message to be posted on meta feed linking feed to a meta
feed. Similar to `deriveFeedKeyFromSeed`, `feedformat` can be either
`bendy butt` for a meta feed or `classic`. `metatada` is an optional
dict.

```js
const msg = sbot.metafeeds.messages.addNewFeed(metafeedKeys, null, 'main', seed, 'classic')
```

#### tombstoneFeed(metafeedKeys, previous, feedKeys, reason, cb)

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

#### generateAnnounceMsg(metafeedKeys, cb)

Generate the content of a message to be published on a main feed
linking it to a meta feed.

```js
sbot.metafeeds.messages.generateAnnounceMsg(metafeedKeys, (err, announceMsg) => {
  sbot.db.publish(announceMsg, (err) => {
    console.log("main feed is now linked to meta feed")
  })
})
```

#### generateSeedSaveMsg(metafeedId, mainfeedId, seed)

Generate the content of a message to save your seed value as a private
message on a main feed.

```js
const seedSaveMsg = sbot.metafeeds.messages.generateSeedSaveMsg(metafeedKeys.id, sbot.id, seed)
sbot.db.publish(seedSaveMsg, (err) => {
  console.log("seed has now been saved, all feed keys generated from this can be restored from the seed")
})
```

### query

#### getSeed(cb)

Gets the stored seed message.

```js
sbot.metafeeds.query.getSeed((err, seed) => {
  console.log("seed buffer", seed)
})
```

#### getAnnounce(cb)

Gets the meta feed announce message on main feed.

```js
sbot.metafeeds.query.getAnnounce((err, msg) => {
  console.log("announce msg", msg)
})
```

#### getMetadata(feedId, cb)

Gets the metafeed message for a given feed to look up metadata.

```js
sbot.metafeeds.query.getMetadata(indexKey.id, (err, content) => {
  console.log("query used for index feed", JSON.parse(content.query))
})
```

#### hydrate(feedId, seed, cb)

Gets the current state (active feeds) of a meta feed.

```js
sbot.metafeeds.query.hydrate(mfKey.id, (err, hydrated) => {
  console.log(hydrated.feeds) // the feeds
  console.log(hydrated.feeds[0].feedpurpose) // 'main'
})
```

[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
