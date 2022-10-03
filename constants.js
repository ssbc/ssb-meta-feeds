const BB1 = 'bendybutt-v1'
const v1Details = { feedpurpose: 'v1', feedformat: BB1 }
const NOT_METADATA = new Set([
  'type',
  'metafeed',
  'feedpurpose',
  'subfeed',
  'tangles',
  'reason',
  'nonce',
  'recps',
])

module.exports = {
  BB1,
  v1Details,
  NOT_METADATA,
}
