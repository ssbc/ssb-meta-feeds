// SPDX-FileCopyrightText: 2021 Anders Rune Jensen
//
// SPDX-License-Identifier: Unlicense

const tape = require('tape')
const fs = require('fs')
const mf = require('../validate')
const bfe = require('ssb-bfe')
const bb = require('ssb-bendy-butt/format')

const vec = JSON.parse(
  fs.readFileSync('test/testvector-metafeed-managment.json', 'utf8')
)

const badVec = JSON.parse(
  fs.readFileSync('test/testvector-metafeed-bad-content.json', 'utf8')
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

function encodedDataToContentSection(data) {
  const msg = bb.fromNativeMsg(data)
  const contentSection = [msg.content, msg.contentSignature]

  return contentSection
}

tape('basic validation works', function (t) {
  const contentSection1 = entryToContentSection(vec.Entries[0])
  const contentSection2 = entryToContentSection(vec.Entries[1])
  const contentSection3 = entryToContentSection(vec.Entries[2])

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

tape('bad message vector tests', function (t) {
  // "1.1: bad type value"
  // convert json vector entry to testable contentSection
  const badMsg1 = Buffer.from(badVec.Cases[0].Entries[0].EncodedData, 'hex')
  const badContentSection1 = encodedDataToContentSection(badMsg1)

  const badContentTypeValidationResult = mf.validateSingle(
    badContentSection1,
    null
  )
  t.deepEqual(
    badContentTypeValidationResult.message,
    'invalid message: content type nope-nope-nope is incorrect',
    'catches invalid content type'
  )

  /* these three entries throw ssb-bfe errors on decode */

  // "2.1: broken subfeed TFK"
  //const badMsg2 = Buffer.from(badVec.Cases[1].Entries[0].EncodedData, 'hex')
  // throws an error in bfe ('Cannot decode buffer ffffddaa56...')
  //const badContentSection2 = encodedDataToContentSection(badMsg2)

  // "2.2: broken metafeed TFK"
  //const badMsg3 = Buffer.from(badVec.Cases[2].Entries[0].EncodedData, 'hex')
  // throws an error in bfe ('Cannot decode buffer ffffab6960...')
  //const badContentSection3 = encodedDataToContentSection(badMsg3)

  // "3.1: bad nonce prefix"
  //const badMsg4 = Buffer.from(badVec.Cases[3].Entries[0].EncodedData, 'hex')
  // throws an error in bfe ('Cannot decode buffer aabba1a1a1...')
  //const badContentSection4 = encodedDataToContentSection(badMsg4)

  // "3.2: bad nonce length (short)"
  const badMsg5 = Buffer.from(badVec.Cases[4].Entries[0].EncodedData, 'hex')
  const badContentSection5 = encodedDataToContentSection(badMsg5)

  const shortNonceValidationResult = mf.validateSingle(badContentSection5, null)
  t.deepEqual(
    shortNonceValidationResult.message,
    'invalid message: content nonce "23232323232323232323232323232323232323232323232323232323232323" is 31 bytes, expected 32',
    'catches invalid nonce (too short)'
  )

  // "3.3: bad nonce length (long)"
  const badMsg6 = Buffer.from(badVec.Cases[5].Entries[0].EncodedData, 'hex')
  const badContentSection6 = encodedDataToContentSection(badMsg6)

  const longNonceValidationResult = mf.validateSingle(badContentSection6, null)
  t.deepEqual(
    longNonceValidationResult.message,
    'invalid message: content nonce "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff0102" is 34 bytes, expected 32',
    'catches invalid nonce (too long)'
  )

  // "4.1: bad content signature"
  const badMsg7 = Buffer.from(badVec.Cases[6].Entries[0].EncodedData, 'hex')
  const badContentSection7 = encodedDataToContentSection(badMsg7)

  const badSignatureValidationResult = mf.validateSingle(
    badContentSection7,
    null
  )
  t.deepEqual(
    badSignatureValidationResult.message,
    'invalid message: contentSignature must correctly sign the content using the subfeed key; @/5VrJbXDi+T02mMdR2lHU1KBxaEEPyhS/MuGpLaeuC0=.ed25519',
    'catches invalid signature'
  )

  t.end()
})
