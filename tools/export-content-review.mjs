import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const vocabularyPath = path.join(root, 'data', 'vocabulary.json')
const outputPath = path.join(root, 'reports', 'cp35', 'content-review-cp35.csv')
const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const header = [
  'word_id', 'word', 'sense_id', 'zh_tw', 'topic', 'difficulty_level',
  'example_1_id', 'example_1_en', 'example_1_zh_tw', 'example_1_target', 'example_1_review_status',
  'example_2_id', 'example_2_en', 'example_2_zh_tw', 'example_2_target', 'example_2_review_status',
  'example_3_en_draft', 'example_3_zh_tw_draft', 'example_3_target',
  'semantic_group', 'part_of_speech', 'review_decision', 'review_notes',
]

const rows = [header]
for (const item of vocabulary) {
  const examples = Array.isArray(item.examples) ? item.examples : []
  const first = examples[0] || {}
  const second = examples[1] || {}
  rows.push([
    item.id, item.word, item.senseId, item.zh, item.topic, item.difficultyLevel,
    first.id, first.en, first.zhTw, first.target, first.reviewStatus,
    second.id, second.en, second.zhTw, second.target, second.reviewStatus,
    '', '', item.word,
    item.semanticGroup || '', item.partOfSpeech || '', '', '',
  ])
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${rows.map(row => row.map(csvCell).join(',')).join('\n')}\n`, 'utf8')
console.log(JSON.stringify({ outputPath, rows: rows.length - 1 }, null, 2))
