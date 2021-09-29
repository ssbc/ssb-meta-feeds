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
sbot.metafeeds.findOrCreate((err, metafeed) => {
  console.log(metafeed) // { seed, keys }
})
```

Now this has created the `seed`, which in turn is used to generate an [ssb-keys]
`keys` object. The `seed` is actually also published on the _main_ feed as a
private message to yourself, to allow recovering it in the future.

There can only be one _root_ meta feed, so even if you call `findOrCreate` many
times, it will not create duplicates, it will just load the meta feed
`{ seed, keys }`.

Now you can create subfeeds _under_ that root meta feed by passing three
arguments to `findOrCreate`, before the callback, like this:

```js
const details = {
  feedpurpose: 'mygame',
  feedformat: 'classic',
  metadata: {
    score: 0,
    whateverElse: true,
  },
}

const visit = f => f.feedpurpose === 'mygame' && f.feedformat === 'classic'

sbot.metafeeds.findOrCreate(metafeed, visit, details, (err, subfeed) => {
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
normal SSB feeds, and `bendybutt-v1`).

The subfeed is created only if it has not been found on your (given) `metafeed`.
Notice that to find an existing matching subfeed, we pass the `visit` function
on the 2nd argument. The `f` there is an object that describes the subfeed, with
the fields:

- `feedformat`: the string `'classic'` or the string `'bendybutt-v1'`
- `feedpurpose`: same string as used to create the subfeed
- `subfeed`: the SSB identifier for this subfeed
- `keys`: the [ssb-keys] compatible `{ curve, public, private, id }` object
- `metadata`: the same object used when creating the subfeed

## API

### `sbot.metafeeds.findById(feedId, cb)`

Given a `feedId` that is presumed to be a subfeed of some meta feed, this API
fetches the metadata associated with the creation of this subfeed on its parent
meta feed, and returns (via the callback `cb` on the second argument) an object
with the following shape:

```
{ feedpurpose, feedformat, metafeed, metadata }
```

### `sbot.metafeeds.findByIdSync(feedId)`

Similar to `findById`, but returns synchronously. :warning: Note, in order to
use this API, you **must** call `sbot.metafeeds.loadState(cb)` first, and wait
for `cb` to be called.

You can also call `sbot.metafeeds.ensureLoaded(feedId, cb)` on an individual
basis to make sure that `findByIdSync` will operate at the correct time when the
`feedId`'s metadata has been processed in the local database.

### `sbot.metafeeds.branchStream(opts)`

Returns a **[pull-stream] source** of all "branches" in the meta feed trees.

A "branch" is an array where the first item is the root meta feed and the
subsequent items are the children and grandchildren (and etc) of the root. A
branch looks like this:

```js
[
  [rootMetafeedId, null],
  [childMetafeedId, childDetails],
  [grandchildMetafeedId, grandchildDetails],
]
```

Or in general, an `Array<[FeedId, Details | null]>`. The **details** object has
the shape `{ feedpurpose, feedformat, metafeed, metadata }` like in `findById`.

`branchStream` will emit all possible branches, which means sub-branches are
included. For instance, in the example above, `branchStream` would emit:

```js
[
  [rootMetafeedId, null]
]
```

and

```js
[
  [rootMetafeedId, null],
  [childMetafeedId, childDetails],
]
```

and

```js
[
  [rootMetafeedId, null],
  [childMetafeedId, childDetails],
  [grandchildMetafeedId, grandchildDetails],
]
```

The `opts` argument can have the following properties:

- `opts.root` _String_ - a feed ID for a root meta feed, only branches that have
  this root would appear in the pull-stream source, otherwise all branches from
  all possible root meta feeds will be included. (Default: `null`)
- `opts.old` _Boolean_ - whether or not to include currently loaded (by
  `loadState`) trees. (Default: `false`)
- `opts.live` _Boolean_ - whether or not to include subsequent meta feed trees
  during the execution of your program. (Default: `true`)

### `sbot.metafeeds.findOrCreate(metafeed, visit, details, cb)`

_Looks for the first subfeed of `metafeed` that satisfies the condition in
`visit`, or creates it matching the properties in `details`._

This is strictly concerned with meta feeds and sub feeds that **you own**, not
with those that belong to other peers.

`metafeed` can be either `null` or a meta feed object `{ seed, keys }` (as
returned by `getRoot()`). If it's null, then the root meta feed will be created,
if and only if it does not already exist. If it's null and the root meta feed
exists, the root meta feed will be returned via the `cb`. Alternatively, you can
call this API with just the callback: `sbot.metafeeds.findOrCreate(cb)`.

`visit` can be either `null` or a function of the shape
`({feedpurpose,subfeed,metadata,keys}) => boolean`. If it's null, then one
arbitrary subfeed under `metafeed` is returned.

`details` can be `null` only if if `metafeed` is null, but usually it's an
object with the properties:

- `feedpurpose`: any string to characterize the purpose of this new subfeed
- `feedformat`: the string `'classic'` or the string `'bendybutt-v1'`
- `metadata`: an optional object containing other fields

The response is delivered to the callback `cb`, where the 1st argument is the
possible error, and the 2nd argument is the created feed (which can be either
the root meta feed `{ seed, keys }` or a sub feed
`{ feedpurpose, subfeed, keys, metadata }`).

### `sbot.metafeeds.findAndTombstone(metafeed, visit, reason, cb)`

_Looks for the first subfeed of `metafeed` that satisfies the condition in
`visit` and, if found, tombstones it with the string `reason`.

This is strictly concerned with meta feeds and sub feeds that **you own**, not
with those that belong to other peers.

`metafeed` must be a meta feed object `{ seed, keys }` (as returned by
`getRoot()`).

`visit` must be a function of the shape `({feedpurpose, subfeed, metadata, keys}) => boolean`.

`reason` must be a string to describe why the found feed is being tombstoned.

The callback is called with `true` on the 2nd argument if tombstoning suceeded,
or called with an error object on the 1st argument if it failed.

### `sbot.metafeeds.getRoot(cb)`

Looks for the root meta feed declared by your main feed, and returns it (as
`{ seed, keys}`) via the callback `cb` if it exists.

If it does not exist, this API will **not** create the root meta feed.

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

### `validateMetafeedAnnounce(msg)`

_Validates a `metafeed/announce` message expected to be published on "main"
feeds which are in the classic format, but are signed by a meta feed according
to the [ssb meta feed spec]._

The response will be `undefined` (for successful validation) or an `Error`
object with a `message` describing the error.

## License

LGPL-3.0

[ssb-keys]: https://github.com/ssb-js/ssb-keys
[ssb meta feed spec]: https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec
[pull-stream]: https://github.com/pull-stream/pull-stream/
