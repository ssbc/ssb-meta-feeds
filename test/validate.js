const tape = require('tape')
const fs = require('fs')
const mf = require('../validate')
const bfe = require('ssb-bfe')

const vec = JSON.parse(
  fs.readFileSync('test/testvector-metafeed-managment.json', 'utf8')
)

function entryToContentSection(entry) {
  let [content, contentSignature] = entry.HighlevelContent
  if (typeof content.nonce === 'string') {
    content.nonce = Buffer.from(content.nonce, 'base64')
  }
  contentSignature = bfe.decode(Buffer.from(contentSignature.HexString, 'hex'))
  const contentSection = [content, contentSignature]

  return contentSection
}

tape('validation works', function (t) {
  const contentSection1 = entryToContentSection(vec.Entries[0])
  const contentSection2 = entryToContentSection(vec.Entries[1])
  const contentSection3 = entryToContentSection(vec.Entries[2])

  t.pass('[ basic tests ]')

  const msg1ValidationResult = mf.validateSingle(contentSection1, null)
  t.deepEqual(
    msg1ValidationResult,
    undefined,
    'validates 1st message contentSection'
  )

  const msg2ValidationResult = mf.validateSingle(contentSection2, null)
  t.deepEqual(
    msg2ValidationResult,
    undefined,
    'validates 2nd message contentSection'
  )

  const msg3ValidationResult = mf.validateSingle(contentSection3, null)
  t.deepEqual(
    msg3ValidationResult,
    undefined,
    'validates 3rd message contentSection'
  )

  contentSection3.push('third item')
  const invalidShapeValidationResult = mf.validateSingle(contentSection3, null)
  t.deepEqual(
    invalidShapeValidationResult.message,
    'invalid message: contentSection object with length 3 is incorrect, expected a list of content and contentSignature',
    'catches invalid contentSection shape'
  )
  // remove the third item
  contentSection3.pop()

  contentSection3[0].subfeed =
    '@Oo6OYCGsjLP3n+cep4FiHJJZGHyqKWztnhDk7vJhi3A=.leaf21'
  t.throws(
    () => {
      mf.validateSingle(contentSection3, null)
    },
    {
      message:
        'No encoder for type=feed format=? for string @Oo6OYCGsjLP3n+cep4FiHJJZGHyqKWztnhDk7vJhi3A=.leaf21',
    },
    'catches unknown subfeed format (throws)'
  )
  // revert subfeed change
  contentSection3[0].subfeed =
    '@Oo6OYCGsjLP3n+cep4FiHJJZGHyqKWztnhDk7vJhi3A=.ed25519'

  contentSection3[0].metafeed =
    '@b99R2e7lj8h7NFqGhOu6lCGy8gLxWV+J4ORd1X7rP3c=.food-v7'
  t.throws(
    () => {
      mf.validateSingle(contentSection3, null)
    },
    {
      message:
        'No encoder for type=feed format=? for string @b99R2e7lj8h7NFqGhOu6lCGy8gLxWV+J4ORd1X7rP3c=.food-v7',
    },
    'catches unknown metafeed format (throws)'
  )
  // revert metafeed change
  contentSection3[0].metafeed =
    '@b99R2e7lj8h7NFqGhOu6lCGy8gLxWV+J4ORd1X7rP3c=.bbfeed-v1'

  const tempSig = contentSection2[1]
  // replace signature to cause invalidation
  contentSection2[1] = contentSection3[1]
  const invalidSignatureValidationResult = mf.validateSingle(
    contentSection2,
    null
  )
  t.deepEqual(
    invalidSignatureValidationResult.message,
    'invalid message: contentSignature must correctly sign the content using the subfeed key; FY5OG311W4j/KPh8H9B2MZt4WSziy/p+ABkKERJdujQ=',
    'catches invalid signature'
  )
  // revert signature change
  contentSection2[1] = tempSig

  // replace content type to cause invalidation
  contentSection3[0].type = 'add/coffee'
  const invalidTypeValidationResult = mf.validateSingle(contentSection3, null)
  t.deepEqual(
    invalidTypeValidationResult.message,
    'invalid message: content type add/coffee is incorrect',
    'catches invalid content type'
  )
  // revert content type change
  contentSection3[0].type = 'metafeed/tombstone'

  // invalidate the nonce
  contentSection2[0].nonce =
    'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkIAAAAAAAAAAAA='
  const invalidNonceValidationResult = mf.validateSingle(contentSection2, null)
  t.deepEqual(
    invalidNonceValidationResult.message,
    'invalid message: content nonce "QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkIAAAAAAAAAAAA=" is 56 bytes, expected 32',
    'catches invalid nonce (too long)'
  )
  // revert nonce change
  contentSection2[0].nonce = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI='

  t.end()
})
