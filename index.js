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
    // Public API
    ...api,

    // Internals
    keys: Keys,
    messages,
    query,
  }
}
