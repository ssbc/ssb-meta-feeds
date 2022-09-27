# Advanced API

Most people using this module should not need to access these methods.
Some of them are low level and there for testing, some are for people wanting to step off
the recommended path.

### `sbot.metafeeds.advanced.findOrCreate(metafeed, isFeed, details, cb)`

Looks for the first subfeed of `metafeed` that satisfies the condition in `isFeed`,
or creates it matching the properties in `details`.

This is strictly concerned with meta feeds and sub feeds that **you own**, not
with those that belong to other peers.

Arguments:
- `metafeed` - the metafeed you are finding/ creating under, can be:
    - *FeedDetails* object (as returned by `findOrCreate()` or `getRoot()`)
    - *null* which is short-hand for the `rootFeed` (this will be created if doesn't exist)
- `isFeed` - method you use to find an existing *FeedDetails*, can be:
    - *function* of shape `(FeedDetails) => boolean`
    - *null* - this method will then return an arbitrary subfeed under provided `metafeed`
- `details` - used to create a new subfeed if a match for an existing one is not found, can be
    - *Object*:
        - `details.feedpurpose` *String* any string to characterize the purpose of this new subfeed
        - `details.feedformat` *String* either `'classic'` or `'bendybutt-v1'`
        - `details.metadata` *Object* (optional) - for containing other data
            - if `details.metadata.recps` is used, the subfeed announcement will be encrypted
    - *null* - only allowed if `metafeed` is null (i.e. the details of the `root` FeedDetails)
- `cb` *function* delivers the response, has signature `(err, FeedDetails)`, where FeedDetails is
    ```js
    {
      metafeed: 'ssb:feed/bendybutt-v1/sxK3OnHxdo7yGZ-28HrgpVq8nRBFaOCEGjRE4nB7CO8=',
      subfeed: '@I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519',
      feedpurpose: 'chess',
      feedformat: 'classic',
      seed: <Buffer 13 10 25 ab e3 37 20 57 19 0a 1d e4 64 13 e7 38 d2 23 11 48 7d 13 e6 3b 8f ef 72 92 7f db 96 64>
      keys: {
        curve: 'ed25519',
        public: 'I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519',
        private: 'Mxa+LL16ws7HZhetR9FbsIOsAeud+ii+9KDUisXkq08jlMEfoG4K8yRIBYlcrBrYUR3zL99Rp+RDXPX0/JfNsQ==.ed25519',
        id: '@I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519'
      },
      metadata: { // example
        notes: 'private testing of chess dev',
        recps: ['@I5TBH6BuCvMkSAWJXKwa2FEd8y/fUafkQ1z19PyXzbE=.ed25519']
      },
    }
    ```

### `sbot.metafeeds.advanced.findById(feedId, cb)`

Given a `feedId` that is presumed to be a subfeed of some meta feed, this API
fetches the *Details* object describing that feed, which is of form:

```js
{
  metafeed,
  feedpurpose,
  feedformat,
  id,
  // seed
  // keys
  metadata
}
```

NOTE - may include `seed`, `keys` if this is one of your feeds.

### `sbot.metafeeds.advanced.findAndTombstone(metafeed, isFeed, reason, cb)`

_Looks for the first subfeed of `metafeed` that satisfies the condition in
`isFeed` and, if found, tombstones it with the string `reason`.

This is strictly concerned with meta feeds and sub feeds that **you own**, not
with those that belong to other peers.

Arguments:
- `metafeed` *FeedDetails* object (as returned by e.g. `findOrCreate()`, `getRoot()`).
- `isFeed` *function* of the shape `(FeedDetails) => Boolean`.
- `reason` *String* - describes why the found feed is being tombstoned.

The callback is called with `true` on the 2nd argument if tombstoning suceeded,
or called with an error object on the 1st argument if it failed.


### `sbot.metafeeds.advanced.getRoot(cb)`

Looks for the root meta feed declared by your main feed, and returns it (as
`{ seed, keys}`) via the callback `cb` if it exists.

If it does not exist, this API will **not** create the root meta feed.


### `sbot.metafeeds.validate.isValid(msg, hmacKey)`

_Validate a single meta feed message._

Extracts the `contentSection` from the given `msg` object and calls
`validateSingle()` to perform validation checks.

If provided, the `hmacKey` is also given as input to the `validateSingle()`
function call. `hmacKey` may be `null` or a valid HMAC key supplied as a
`Buffer` or `string`.

The response is a boolean: `true` if validation is successful, `false` if
validation fails in any way. Note that this function does not return the
underlying cause of the validation failure.

### `sbot.metafeeds.validate.validateSingle(contentSection, hmacKey)`

_Validate a single meta feed message `contentSection` according to the criteria
defined in the [specification](https://github.com/ssb-ngi-pointer/ssb-meta-feed-spec#usage-of-bendy-butt-feed-format)._

`contentSection` must be an array of `content` and `contentSignature`. If a
`string` is provided (representing an encrypted message, for instance) an error
will be returned; an encrypted `contentSection` cannot be validated.

`hmacKey` may be `null` or a valid HMAC key supplied as a `Buffer` or `string`.

The response will be `undefined` (for successful validation) or an `Error`
object with a `message` describing the error.

### `sbot.metafeeds.validate.validateMetafeedAnnounce(msg)`

_Validates a `metafeed/announce` message expected to be published on "main"
feeds which are in the classic format, but are signed by a meta feed according
to the [ssb meta feed spec]._

The response will be `undefined` (for successful validation) or an `Error`
object with a `message` describing the error.

</details>

