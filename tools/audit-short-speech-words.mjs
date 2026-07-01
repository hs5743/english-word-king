import fs from 'node:fs'

const vocabulary = JSON.parse(fs.readFileSync('data/vocabulary.json', 'utf8'))

const SHORT_WORD_MAX_LEN = 4
const SPECIAL_CASES = new Map([
  ['ok', 'I am OK. / accepts ok, okay, o k'],
  ['well', 'I feel well. / close: will'],
])

function speechKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z]/g, '')
}

const rows = vocabulary
  .filter(item => item && item.enabled !== false)
  .map(item => ({
    word: String(item.word || '').trim(),
    key: speechKey(item.word),
    zh: item.zh || '',
    topic: item.topic || '',
  }))
  .filter(item => item.key && item.key.length <= SHORT_WORD_MAX_LEN)
  .sort((a, b) => a.key.localeCompare(b.key))

const byKey = new Map()
rows.forEach(item => {
  if (!byKey.has(item.key)) byKey.set(item.key, [])
  byKey.get(item.key).push(item)
})

const duplicateKeys = [...byKey.entries()].filter(([, items]) => items.length > 1)
const specialHits = rows.filter(item => SPECIAL_CASES.has(item.key))

console.log(`Short speech words (<=${SHORT_WORD_MAX_LEN} letters): ${rows.length}`)
console.log(`Special cases covered: ${specialHits.map(item => item.word).join(', ') || 'none'}`)

if (duplicateKeys.length) {
  console.log('\nDuplicate normalized short keys:')
  duplicateKeys.forEach(([key, items]) => {
    console.log(`- ${key}: ${items.map(item => item.word).join(', ')}`)
  })
}

console.log('\nSpecial-case rules:')
SPECIAL_CASES.forEach((note, key) => {
  const exists = byKey.has(key) ? 'in vocabulary' : 'not in vocabulary'
  console.log(`- ${key}: ${note} (${exists})`)
})

console.log('\nSample short words:')
console.log(rows.slice(0, 120).map(item => item.word).join(', '))
