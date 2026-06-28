import fs from 'node:fs'

const VOCAB_PATH = 'data/vocabulary.json'
const FIX_MODE = process.argv.includes('--fix')

const topicFixes = {
  // Common verbs and verb phrases previously imported as Other/School/Food/etc.
  answer: 'Actions',
  bring: 'Actions',
  brush: 'Actions',
  buy: 'Actions',
  call: 'Actions',
  catch: 'Actions',
  caught: 'Actions',
  choose: 'Actions',
  clean: 'Adjectives',
  close: 'Actions',
  come: 'Actions',
  cook: 'Actions',
  cry: 'Actions',
  draw: 'Actions',
  enjoy: 'Actions',
  enter: 'Actions',
  find: 'Actions',
  finish: 'Actions',
  flown: 'Actions',
  found: 'Actions',
  get: 'Actions',
  grew: 'Actions',
  have: 'Actions',
  hear: 'Actions',
  heard: 'Actions',
  help: 'Actions',
  hit: 'Actions',
  hurry: 'Actions',
  hurt: 'Actions',
  invite: 'Actions',
  know: 'Actions',
  known: 'Actions',
  laugh: 'Actions',
  learn: 'Actions',
  like: 'Actions',
  listen: 'Actions',
  look: 'Actions',
  love: 'Actions',
  make: 'Actions',
  miss: 'Actions',
  need: 'Actions',
  open: 'Actions',
  'pick up': 'Actions',
  practice: 'Actions',
  read: 'Actions',
  see: 'Actions',
  show: 'Actions',
  sit: 'Actions',
  sleep: 'Actions',
  smell: 'Actions',
  speak: 'Actions',
  spell: 'Actions',
  spoken: 'Actions',
  stand: 'Actions',
  start: 'Actions',
  stood: 'Actions',
  stop: 'Actions',
  sweep: 'Actions',
  taste: 'Actions',
  teach: 'Actions',
  tell: 'Actions',
  thank: 'Actions',
  think: 'Actions',
  thought: 'Actions',
  touch: 'Actions',
  try: 'Actions',
  use: 'Actions',
  wait: 'Actions',
  walk: 'Actions',
  wear: 'Actions',
  wore: 'Actions',
  worry: 'Actions',
  written: 'Actions',

  // Descriptive words.
  dirty: 'Adjectives',
  easy: 'Adjectives',
  favorite: 'Adjectives',
  fine: 'Adjectives',
  full: 'Adjectives',
  great: 'Adjectives',
  hard: 'Adjectives',
  only: 'Adjectives',
  other: 'Adjectives',
  quiet: 'Adjectives',
  ready: 'Adjectives',
  sure: 'Adjectives',
  sweet: 'Adjectives',
  thirsty: 'Adjectives',
  wonderful: 'Adjectives',
  yummy: 'Adjectives',

  // Function words.
  again: 'Other adverbs',
  always: 'Other adverbs',
  away: 'Other adverbs',
  maybe: 'Other adverbs',
  never: 'Other adverbs',
  not: 'Other adverbs',
  really: 'Other adverbs',
  so: 'Other adverbs',
  sometimes: 'Other adverbs',
  still: 'Other adverbs',
  then: 'Other adverbs',
  together: 'Other adverbs',
  too: 'Other adverbs',
  usually: 'Other adverbs',
  very: 'Other adverbs',
  no: 'Interjections',
  yes: 'Interjections',
  welcome: 'Interjections',
}

const vocabulary = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'))
let changed = 0
const suggestions = []

for (const item of vocabulary) {
  const word = String(item.word || '').toLowerCase().trim()
  if (!word) continue
  const targetTopic = topicFixes[word]
  if (!targetTopic || item.topic === targetTopic) continue

  suggestions.push({
    id: item.id,
    word: item.word,
    zh: item.zh,
    from: item.topic,
    to: targetTopic,
  })

  if (FIX_MODE) {
    item.topic = targetTopic
    changed++
  }
}

if (FIX_MODE && changed > 0) {
  fs.writeFileSync(VOCAB_PATH, `${JSON.stringify(vocabulary, null, 2)}\n`, 'utf8')
}

const byTarget = suggestions.reduce((acc, row) => {
  acc[row.to] = (acc[row.to] || 0) + 1
  return acc
}, {})

console.log(`Vocabulary topic audit: ${suggestions.length} suggestion(s)${FIX_MODE ? `, ${changed} applied` : ''}.`)
console.log(Object.entries(byTarget).map(([topic, count]) => `${topic}: ${count}`).join('\n') || 'No topic changes needed.')

if (!FIX_MODE && suggestions.length > 0) {
  console.log('\nRun with --fix to apply the reviewed allow-list corrections.')
  console.log(suggestions.slice(0, 80).map(row => `${row.word} (${row.zh}): ${row.from} -> ${row.to}`).join('\n'))
}
