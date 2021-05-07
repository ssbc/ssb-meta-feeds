const ssbKeys = require('ssb-keys')

// FIXME: define and use json schema

exports.operation = function(operation, feedformat, feedpurpose,
                             subfeedKey, metafeedKey) {
  const msg = {
    type: 'metafeed/operation',
    operation,
    feedformat,
    feedpurpose,
    subfeed: subfeedKey.id,
    metafeed: metafeedKey.id, 
    nonce: Date.now()
  }
  msg.subfeedSignature = ssbKeys.sign(subfeedKey, JSON.stringify(msg))
  
  return msg
}
