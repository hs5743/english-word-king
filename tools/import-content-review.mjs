import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const vocabularyPath = path.join(root, 'data', 'vocabulary.json')
const reviewPath = path.join(root, 'reports', 'cp35', 'content-review-cp35.csv')
const shouldWrite = process.argv.includes('--write')

function parseCsv(content) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < content.length; index++) {
    const char = content[index]
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') { cell += '"'; index++ }
      else if (char === '"') quoted = false
      else cell += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(cell); cell = '' }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = '' }
    else cell += char
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

function rowObjects(rows) {
  const headers = rows[0] || []
  return rows.slice(1).filter(row => row.some(Boolean)).map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])))
}

function reviewedExample(row, number) {
  return {
    id: row[`example_${number}_id`] || `${row.word_id}-ex${number}`,
    en: row[`example_${number}_en`].trim(),
    zhTw: row[`example_${number}_zh_tw`].trim(),
    target: row[`example_${number}_target`].trim(),
    reviewStatus: 'approved',
    contentVersion: 2,
  }
}

const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))
const reviews = rowObjects(parseCsv(fs.readFileSync(reviewPath, 'utf8')))
const reviewById = new Map(reviews.map(row => [row.word_id, row]))
let approvedWords = 0
const skipped = []

const updated = vocabulary.map(item => {
  const row = reviewById.get(item.id)
  if (!row || row.review_decision.trim().toLowerCase() !== 'approve') return item
  const required = [
    row.example_1_en, row.example_1_zh_tw, row.example_1_target,
    row.example_2_en, row.example_2_zh_tw, row.example_2_target,
    row.example_3_en_draft, row.example_3_zh_tw_draft, row.example_3_target,
    row.semantic_group, row.part_of_speech,
  ]
  if (required.some(value => !String(value || '').trim())) {
    skipped.push({ word: item.word, reason: 'approved row has missing required fields' })
    return item
  }
  approvedWords++
  return {
    ...item,
    senseId: row.sense_id || item.senseId,
    zh: row.zh_tw || item.zh,
    semanticGroup: row.semantic_group.trim(),
    partOfSpeech: row.part_of_speech.trim(),
    examples: [
      reviewedExample(row, 1),
      reviewedExample(row, 2),
      {
        id: `${item.id}-ex3`,
        en: row.example_3_en_draft.trim(),
        zhTw: row.example_3_zh_tw_draft.trim(),
        target: row.example_3_target.trim(),
        reviewStatus: 'approved',
        contentVersion: 2,
      },
    ],
  }
})

console.log(JSON.stringify({ mode: shouldWrite ? 'write' : 'preview', approvedWords, skipped }, null, 2))
if (skipped.length) process.exitCode = 1
if (shouldWrite && !skipped.length) fs.writeFileSync(vocabularyPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8')
