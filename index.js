exports.name = 'metafeeds'

exports.init = function (sbot, config) {
  return {
    keys: require('./keys'),
    mainfeed: require('./mainfeed').init(sbot),
    metafeed: require('./metafeed').init(sbot),
    query: require('./query').init(sbot)
  }
}
