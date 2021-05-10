const { author, and, type } = require('ssb-db2/operators')

exports.generateAnnounceMsg = function(metafeedKey, sbot, cb) {
  let query = and(author(sbot.id), type('metafeed/announce'))

  sbot.db.getJITDB().all(query, 0, false, false, (err, results) => {
    const rootAnnounceId = results.length > 0 ? results[0].key : null
    const previousAnnounceId = results.length > 0 ? results[results.length-1].key : null

    const msg = {
      type: 'metafeed/announce',
      metafeed: metafeedKey.id, 
      tangle: {
        metafeed: { root: rootAnnounceId, previous: previousAnnounceId }
      }
    }

    cb(null, msg)
  })
}
