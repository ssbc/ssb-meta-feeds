const ssbKeys = require('ssb-keys')

// FIXME: define and use json schema

exports.add = function(feedformat, feedpurpose, subfeedKey, metafeedKey, metadata) {
  let msg = {
    type: 'metafeed/add',
    feedformat,
    feedpurpose,
    subfeed: subfeedKey.id,
    metafeed: metafeedKey.id, 
    nonce: Date.now(),
    tangle: {
      metafeed: { root: null, previous: null }
    }
  }

  if (metadata)
    msg = Object.assign(msg, metadata)

  msg.subfeedSignature = ssbKeys.sign(subfeedKey, JSON.stringify(msg))

  return msg
}

exports.tombstone = function(subfeedKey, root, previous, reason) {
  const msg = {
    type: 'metafeed/tombstone',
    subfeed: subfeedKey.id,
    nonce: Date.now(),
    reason,
    tangle: {
      metafeed: { root, previous }
    }
  }
  msg.subfeedSignature = ssbKeys.sign(subfeedKey, JSON.stringify(msg))

  return msg
}
