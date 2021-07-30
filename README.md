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
sbot.metafeeds.metafeed.getOrCreate((err, mf) => {
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

[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
