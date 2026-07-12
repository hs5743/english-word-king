import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const vocabularyPath = path.join(root, 'data', 'vocabulary.json')
const shouldWrite = process.argv.includes('--write')
const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))

function normalizeId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function makeExample(item, index, en, zhTw) {
  return {
    id: `${normalizeId(item.id || item.word)}-ex${index}`,
    en: String(en || '').trim(),
    zhTw: String(zhTw || '').trim(),
    target: String(item.word || '').trim(),
    reviewStatus: 'legacy_review_required',
    contentVersion: 1,
  }
}

let migratedWords = 0
let migratedExamples = 0
const migrated = vocabulary.map(item => {
  if (Number(item.contentSchemaVersion) >= 2 && Array.isArray(item.examples)) return item
  const examples = []
  if (item.sentence && item.sentenceZh) examples.push(makeExample(item, 1, item.sentence, item.sentenceZh))
  if (item.sentence2 && item.sentence2Zh) examples.push(makeExample(item, 2, item.sentence2, item.sentence2Zh))
  migratedWords++
  migratedExamples += examples.length
  return {
    ...item,
    contentSchemaVersion: 2,
    senseId: item.senseId || item.id || normalizeId(item.word),
    examples,
  }
})

console.log(JSON.stringify({
  mode: shouldWrite ? 'write' : 'preview',
  words: vocabulary.length,
  migratedWords,
  migratedExamples,
}, null, 2))

if (shouldWrite) {
  fs.writeFileSync(vocabularyPath, `${JSON.stringify(migrated, null, 2)}\n`, 'utf8')
  console.log(`Updated ${vocabularyPath}`)
}
