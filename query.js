const pull = require('pull-stream')
const { author } = require('ssb-db2/operators')

exports.name = 'metafeeds'

exports.manifest = {
  hydrate: 'async',
}

exports.init = function (sbot, config) {
  return {
    hydrate(feedId, cb) {
      let query = author(feedId)

      sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
        if (err) return cb(err)

        const feeds = results.filter(msg => msg.value.content.type === 'metafeed/add').map(msg => {
          const { feedformat, feedpurpose, subfeed } = msg.value.content
          return {
            feedformat,
            feedpurpose,
            subfeed
          }
        })

        const tombstoned = results.filter(msg => msg.value.content.type === 'metafeed/tombstone').map(msg => {
          const { feedformat, feedpurpose, subfeed } = msg.value.content
          return {
            feedformat,
            feedpurpose,
            subfeed
          }
        })

        cb(null, {
          feeds: feeds.filter(feed => tombstoned.filter(t => t.subfeed === feed.subfeed).length === 0),
          tombstoned
        })
      })
    }
  }
}
