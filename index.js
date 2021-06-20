exports.name = 'metafeeds'

exports.init = function (sbot, config) {
  return {
    keys: require('./keys'),
    messages: require('./messages').init(sbot),
    query: require('./query').init(sbot)
  }
}
