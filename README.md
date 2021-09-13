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

Let's start by creating a **root meta feed**, necessary for using this module.
It lives alongside your existing "classical" feed, which we'll refer to as
**main feed**.

```js
sbot.metafeeds.create((err, metafeed) => {
  console.log(metafeed) // { seed, keys }
})
```

Now this has created the `seed`, which in turn is used to generate an [ssb-keys]
`keys` object. The `seed` is actually also published on the _main_ feed as a
private message to yourself, to allow recovering it in the future. The first two
arguments above are null when we're creating the _root_ meta feed, but not in
other use cases of `create`.

There can only be one _root_ meta feed, so even if you call `create` many times,
it will not create duplicates, it will just load the meta feed `{ seed, keys }`.

Now you can create subfeeds _under_ that root meta feed like this:

```js
const details = {
  feedpurpose: 'mygame',
  feedformat: 'classic',
  metadata: {
    score: 0,
    whateverElse: true,
  },
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
application-specific messages (such as for a game). The `details` argument
always needs `feedpurpose` and `feedformat` (supports `classic` for ed25519
normal SSB feeds, and `bendy butt`).

To look up sub feeds belonging to the root meta feed, we can use `filter` and
`find`. These are similar to Array [filter](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/filter)
and [find](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/find):

```js
sbot.metafeeds.filter(
  metafeed,
  (f) => f.feedpurpose === 'mygame',
  (err, feeds) => {
    console.log(feeds)
    // [
    //   { feedpurpose, subfeed, keys }
    // ]
  }
)
```

```js
sbot.metafeeds.find(
  metafeed,
  (f) => f.feedpurpose === 'mygame',
  (err, feed) => {
    console.log(feed)
    // { feedpurpose, subfeed, keys }
  }
)
```

Notice that each `f` (and the result) is an object that describes the subfeed,
with the fields:

- `feedpurpose`: same string as used to create the subfeed
- `subfeed`: the SSB identifier for this subfeed
- `keys`: the [ssb-keys] compatible `{ curve, public, private, id }` object
- `metadata`: the same object used when creating the subfeed

Finally, there are many cases where you want to create a subfeed **only if** it
doesn't yet exist. For those purposes, use `findOrCreate`, which is a mix of
`find` and `create`. It literally will internally call `find`, and only call
`create` if `find` did not find a subfeed. For instance:

```js
const details = {
  feedpurpose: 'mygame',
  feedformat: 'classic',
  metadata: {
    score: 0,
    whateverElse: true,
  },
}

sbot.metafeeds.findOrCreate(
  metafeed,
  (f) => f.feedpurpose === 'mygame',
  details, // only used if the "find" part fails
  (err, feed) => {
    console.log(feed)
  }
)
```

## API

Some of these APIs can only be used on feeds that **you own** (🌻) while other
APIs can be used on any feed (🌷), i.e. feeds created by other peers.

### 🌷 `sbot.metafeeds.findById(feedId, cb)`

Given a `feedId` that is presumed to be a subfeed of some meta feed, this API
fetches the metadata associated with the creation of this subfeed on its parent
meta feed, and returns (via the callback `cb` on the second argument) an object
with the following shape:

```
{ feedpurpose, feedformat, metafeed, metafeed }
```

### 🌷 `sbot.metafeeds.findByIdSync(feedId)`

Similar to `findById`, but returns synchronously. :warning: Note, in order to
use this API, you **must** call `sbot.metafeeds.loadState(cb)` first, and wait
for `cb` to be called.

### 🌻 `sbot.metafeeds.find(metafeed, visit, cb)`

_Looks for the first subfeed of `metafeed` that satisfies the condition in
`visit`._

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as
returned by `create()`). If it's null, then the result will be an array
containing one item, the root meta feed, or zero items if the root meta feed
does not exist.

`visit` can be either `null` or a function of the shape
`({feedpurpose,subfeed,keys}) => boolean`. If it's null, then one arbitrary
subfeed under `metafeed` is returned.

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is the found feed (which can be either the
root meta feed `{ seed, keys }` or a sub feed
`{ feedpurpose, subfeed, keys, metadata }`).

### 🌻 `sbot.metafeeds.filter(metafeed, visit, cb)`

_Looks for all subfeeds of `metafeed` that satisfy the condition in `visit`._

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as
returned by `create()`). If it's null, then the result will be an array
containing one item, the root meta feed, or zero items if the root meta feed
does not exist.

`visit` can be either `null` or a function of the shape
`({feedpurpose,subfeed,keys}) => boolean`. If it's null, then all subfeeds under
`metafeed` are returned.

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is an array containing the found feeds
(which can be either the root meta feed `{ seed, keys }` or a sub feed
`{ feedpurpose, subfeed, keys, metadata }`).

### 🌻 `sbot.metafeeds.create(metafeed, details, cb)`

_Creates a new subfeed of `metafeed` matching the properties described in
`details`._

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as
returned by `create()`). If it's null, then the root meta feed will be created,
if and only if it does not already exist. If it's null and the root meta feed
exists, the root meta feed will be returned via the `cb`.

`details` can be `null` only if `metafeed` is null, but usually it's an object
with the properties:

- `feedpurpose`: any string to characterize the purpose of this new subfeed
- `feedformat`: the string `'classic'` or the string `'bendy butt'`
- `metadata`: an optional object containing other fields

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is the created feed (which can be either
the root meta feed `{ seed, keys }` or a sub feed
`{ feedpurpose, subfeed, keys }`).

### 🌻 `sbot.metafeeds.findOrCreate(metafeed, visit, details, cb)`

_Looks for the first subfeed of `metafeed` that satisfies the condition in
`visit`, or creates it matching the properties in `details`._

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as
returned by `create()`). If it's null, then the root meta feed will be created,
if and only if it does not already exist. If it's null and the root meta feed
exists, the root meta feed will be returned via the `cb`. Alternatively, you can
call this API with just the callback: `sbot.metafeeds.findOrCreate(cb)`.

`visit` can be either `null` or a function of the shape
`({feedpurpose,subfeed,metadata,keys}) => boolean`. If it's null, then one
arbitrary subfeed under `metafeed` is returned.

`details` can be `null` only if if `metafeed` is null, but usually it's an
object with the properties:

- `feedpurpose`: any string to characterize the purpose of this new subfeed
- `feedformat`: the string `'classic'` or the string `'bendy butt'`
- `metadata`: an optional object containing other fields

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is the created feed (which can be either
the root meta feed `{ seed, keys }` or a sub feed
`{ feedpurpose, subfeed, keys, metadata }`).

### 🌻 `sbot.metafeeds.filterTombstoned(metafeed, visit, cb)`

_Looks for all tombstoned subfeeds of `metafeed` that satisfy the condition in
`visit`._

`metafeed` must be a meta feed object `{ seed, keys }` (as returned by
`create()`).

`visit` can be either `null` or a function of the shape
`({feedpurpose,subfeed,metadata}) => boolean`. If it's null, then all tombstoned
subfeeds under `metafeed` are returned.

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is an array containing the found tombstoned
feeds.

### 🌻 `sbot.metafeeds.find(metafeed, visit, cb)`

_Looks for the first tombstoned subfeed of `metafeed` that satisfies the
condition in `visit`._

`metafeed` must be a meta feed object `{ seed, keys }` (as returned by
`create()`).

`visit` can be either `null` or a function of the shape
`({feedpurpose,subfeed,metadata,keys}) => boolean`. If it's null, then one
arbitrary tombstoned subfeed under `metafeed` is returned.

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is the found tombstoned feed.

## Validation

Exposed via the internal API.

### `isValid(msg, hmacKey)`

_Validate a single meta feed message._

Extracts the `contentSection` from the given `msg` object and calls
`validateSingle()` to perform validation checks.

If provided, the `hmacKey` is also given as input to the `validateSingle()`
function call. `hmacKey` may be `null` or a valid HMAC key supplied as a
`Buffer` or `string`.

The response is a boolean: `true` if validation is successful, `false` if
validation fails in any way. Note that this function does not return the
underlying cause of the validation failure.

### `validateSingle(contentSection, hmacKey)`

_Validate a single meta feed message `contentSection` according to the criteria
defined in the [specification](https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec#usage-of-bendy-butt-feed-format)._

`contentSection` must be an array of `content` and `contentSignature`. If a
`string` is provided (representing an encrypted message, for instance) an error
will be returned; an encrypted `contentSection` cannot be validated.

`hmacKey` may be `null` or a valid HMAC key supplied as a `Buffer` or `string`.

The response will be `undefined` (for successful validation) or an `Error`
object with a `message` describing the error.

## License

LGPL-3.0

[ssb-keys]: https://github.com/ssb-js/ssb-keys
[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
