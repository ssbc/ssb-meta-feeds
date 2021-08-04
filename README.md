# SSB meta feeds

An implementation of the [ssb meta feed spec] in JS as a secret stack
plugin.

## Installation

**Prerequisites:**

- Requires **Node.js 10** or higher
- Requires `ssb-db2`

```
npm install --save ssb-meta-feeds
```

Add this plugin like this:

```diff
 const sbot = SecretStack({ appKey: caps.shs })
     .use(require('ssb-db2'))
+    .use(require('ssb-meta-feeds'))
     // ...
```

## Example usage

Let's start by create a **root meta feed**, necessary for using this module. It
lives alongside your existing "classical" feed, which we'll refer to as **main
feed**.

```js
sbot.metafeeds.create(null, null, (err, metafeed) => {
  console.log(metafeed) // { seed, keys }
})
```

Now this has created the `seed`, which in turn is used to generate an [ssb-keys]
`keys` object. The `seed` is actually also published on the *main* feed as a
private message to yourself, to allow recovering it in the future. The first two
arguments above are null when we're creating the *root* meta feed, but not in
other use cases of `create`.

There can only be one *root* meta feed, so even if you call `create` many times,
it will not create duplicates, it will just load the meta feed `{ seed, keys }`.

Now you can create subfeeds *under* that root meta feed like this:

```js
const details = {
  feedpurpose: 'mygame',
  feedformat: 'classic',
  metadata: {
    score: 0,
    whateverElse: true
  }
}

sbot.metafeeds.create(metafeed, details, (err, subfeed) => {
  console.log(subfeed)
  // {
  //   feedpurpose: 'mygame',
  //   subfeed: '@___________________________________________=.ed25519',
  //   keys: {
  //     curve,
  //     public,
  //     private,
  //     id
  //   }
  // }
})
```

This has created a `keys` object for a new subfeed, which you can use to publish
application-specific messages (such as for a game). The `details` argument always
needs `feedpurpose` and `feedformat` (supports `classic` for ed25519 normal SSB
feeds, and `bendy butt`).

To look up sub feeds belonging to the root meta feed, we can use `filter` and `find`. These are similar to Array [filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter) and [find](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find):

```js
sbot.metafeeds.filter(metafeed, f => f.feedpurpose === 'mygame', (err, feeds) => {
  console.log(feeds)
  // [
  //   { feedpurpose, subfeed, keys }
  // ]
})
```

```js
sbot.metafeeds.find(metafeed, f => f.feedpurpose === 'mygame', (err, feed) => {
  console.log(feed)
  // { feedpurpose, subfeed, keys }
})
```

Notice that each `f` (and the result) is an object that describes the subfeed, with the fields:

* `feedpurpose`: same string as used to create the subfeed
* `subfeed`: the SSB identifier for this subfeed
* `keys`: the [ssb-keys] compatible `{ curve, public, private, id }` object

Finally, there are many cases where you want to create a subfeed **only if** it doesn't yet exist. For those purposes, use `findOrCreate`, which is a mix of `find` and `create`. It literally will internally call `find`, and only call `create` if `find` did not find a subfeed. For instance:

```js
const details = {
  feedpurpose: 'mygame',
  feedformat: 'classic',
  metadata: {
    score: 0,
    whateverElse: true
  }
}

sbot.metafeeds.findOrCreate(
  metafeed,
  f => f.feedpurpose === 'mygame',
  details, // only used if the "find" part fails
  (err, feed) => {
    console.log(feed)
  }
)
```

## API

### `sbot.metafeeds.filter(metafeed, visit, cb)`

*Looks for all subfeeds of `metafeed` that satisfy the condition in `visit`.*

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as returned by `create()`). If it's null, then the result will be an array containing one item, the root meta feed, or zero items if the root meta feed does not exist.

`visit` can be either `null` or a function of the shape `({feedpurpose,subfeed,keys}) => boolean`. If it's null, then all subfeeds under `metafeed` are returned.

The response is delivered to the callback `cb`, where the 1st argument is the possible error, and the 2nd argument is an array containing the found feeds (which can be either the root meta feed `{ seed, keys }` or a sub feed `{ feedpurpose, subfeed, keys }`).

### `sbot.metafeeds.find(metafeed, visit, cb)`

*Looks for the first subfeed of `metafeed` that satisfies the condition in `visit`.*

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as returned by `create()`). If it's null, then the result will be an array containing one item, the root meta feed, or zero items if the root meta feed does not exist.

`visit` can be either `null` or a function of the shape `({feedpurpose,subfeed,keys}) => boolean`. If it's null, then one arbitrary subfeed under `metafeed` is returned.

The response is delivered to the callback `cb`, where the 1st argument is the possible error, and the 2nd argument is the found feed (which can be either the root meta feed `{ seed, keys }` or a sub feed `{ feedpurpose, subfeed, keys }`).

### `sbot.metafeeds.create(metafeed, details, cb)`

*Creates a new subfeed of `metafeed` matching the properties described in `details`.*

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as returned by `create()`). If it's null, then the root meta feed will be created, if and only if it does not already exist. If it's null and the root meta feed exists, the root meta feed will be returned via the `cb`.

`details` can be `null` only if `metafeed` is null, but usually it's an object with the properties:

* `feedpurpose`: any string to characterize the purpose of this new subfeed
* `feedformat`: the string `'classic'` or the string `'bendy butt'`
* `metadata`: an optional object containing other fields

The response is delivered to the callback `cb`, where the 1st argument is the possible error, and the 2nd argument is the created feed (which can be either the root meta feed `{ seed, keys }` or a sub feed `{ feedpurpose, subfeed, keys }`).

### `sbot.metafeeds.findOrCreate(metafeed, visit, details, cb)`

*Looks for the first subfeed of `metafeed` that satisfies the condition in `visit`, or creates it matching the properties in `details`.*

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as returned by `create()`). If it's null, then the root meta feed will be created, if and only if it does not already exist. If it's null and the root meta feed exists, the root meta feed will be returned via the `cb`.

`visit` can be either `null` or a function of the shape `({feedpurpose,subfeed,keys}) => boolean`. If it's null, then one arbitrary subfeed under `metafeed` is returned.

`details` can be `null` only if if `metafeed` is null, but usually it's an object with the properties:

* `feedpurpose`: any string to characterize the purpose of this new subfeed
* `feedformat`: the string `'classic'` or the string `'bendy butt'`
* `metadata`: an optional object containing other fields

The response is delivered to the callback `cb`, where the 1st argument is the possible error, and the 2nd argument is the created feed (which can be either the root meta feed `{ seed, keys }` or a sub feed `{ feedpurpose, subfeed, keys }`).

## License

LGPL-3.0

[ssb-keys]: https://github.com/ssb-js/ssb-keys
[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
