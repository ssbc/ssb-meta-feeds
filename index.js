const Keys = require('./keys')
const Messages = require('./messages')
const Query = require('./query')
const API = require('./api')

exports.name = 'metafeeds'

exports.init = function (sbot, config) {
  const messages = Messages.init(sbot, config)
  const query = Query.init(sbot, config)
  const api = API.init(sbot, config)

  return {
    getOrCreate: api.getOrCreate,

    // Internals
    keys: Keys,
    messages,
    query,
  }
}
