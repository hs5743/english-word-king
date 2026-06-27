import fs from 'node:fs'

const vocabulary = JSON.parse(fs.readFileSync('data/vocabulary.json', 'utf8'))

const topicByWord = new Map(
  vocabulary
    .filter(item => item.enabled !== false && item.word)
    .map(item => [String(item.word).toLowerCase().trim(), String(item.topic || '').trim()])
)

const expectedTopics = {
  ask: 'Actions',
  talk: 'Actions',
  fast: 'Adjectives',
  slow: 'Adjectives',
  hungry: 'Adjectives',
  take: 'Actions',
  want: 'Actions',
  go: 'Actions',
  put: 'Actions',
  wake: 'Actions',
  live: 'Actions',
  grow: 'Actions',
  drink: 'Actions',
  wash: 'Actions',
  meet: 'Actions',
  give: 'Actions',
  say: 'Actions',
  feel: 'Actions',
  hope: 'Actions',
}

for (const [word, topic] of Object.entries(expectedTopics)) {
  if (topicByWord.get(word) !== topic) {
    throw new Error(`Topic cleanup failed: ${word} should be ${topic}, got ${topicByWord.get(word)}`)
  }
}

const expansion = vocabulary.find(item => String(item.word || '').toLowerCase().trim() === 'expansion')
if (expansion?.enabled !== false) {
  throw new Error('Polluted vocabulary item "Expansion / 新竹縣鳳岡區" must stay disabled')
}

const bank = vocabulary
  .filter(item => item.enabled !== false && item.word && Number(String(item.gradeBand || '').match(/\d+/)?.[0] || 3) <= 3)
  .map(item => ({
    word: String(item.word).toLowerCase().trim(),
    topic: String(item.topic || '').trim(),
  }))

const mastery = {
  apple: 3,
  banana: 3,
  book: 3,
  dog: 3,
  cat: 3,
  ask: 0,
  talk: 0,
  run: 1,
  jump: 2,
}
const wrongWords = ['ask', 'talk', 'slow']

const selected = selectCandidatePool(bank, mastery, wrongWords)
const selectedWords = selected.map(item => item.word)
const selectedTopics = new Set(selected.map(item => normalizeTopicName(item.topic)))

assert(selected.length === 10, `Expected 10 candidates, got ${selected.length}`)
assert(new Set(selectedWords).size === selectedWords.length, 'Candidates should be unique')
assert(['ask', 'talk', 'slow'].every(word => selectedWords.includes(word)), `Weak words missing: ${selectedWords.join(', ')}`)
assert(selectedTopics.has('Actions'), `Expected weak Actions topic in ${[...selectedTopics].join(', ')}`)
assert(selectedTopics.has('Adjectives'), `Expected weak Adjectives topic in ${[...selectedTopics].join(', ')}`)
assert(selected.some(item => mastery[item.word] === undefined), 'Expected at least one new word')
assert(selected.some(item => mastery[item.word] === 3), 'Expected at least one mastered review word')

console.log('Spiral selection OK:', selectedWords.join(', '))

function selectCandidatePool(available, mastery, wrongWords) {
  const normalizedWrongWords = normalizeWordList(wrongWords)
  const wrongSet = new Set(normalizedWrongWords)
  const weakTopics = getWeakTopics(available, mastery, normalizedWrongWords)
  const selected = []
  const selectedWords = new Set()
  const bucketCounts = {
    weak: 0,
    'weak-topic': 0,
    learning: 0,
    new: 0,
    mastered: 0,
    fill: 0,
  }

  const addFrom = (pool, quota, bucket) => {
    for (const item of pool) {
      if (selected.length >= 10 || bucketCounts[bucket] >= quota) break
      const key = normalizeWord(item.word)
      if (!key || selectedWords.has(key)) continue
      selectedWords.add(key)
      selected.push(item)
      bucketCounts[bucket]++
    }
  }

  const weakPool = available.filter(w => wrongSet.has(normalizeWord(w.word)) || mastery[normalizeWord(w.word)] === 0)
  const weakTopicPool = available.filter(w => {
    const key = normalizeWord(w.word)
    return weakTopics.includes(normalizeTopicName(w.topic)) && !wrongSet.has(key) && mastery[key] !== 3
  })
  const learningPool = available.filter(w => {
    const score = mastery[normalizeWord(w.word)]
    return score === 1 || score === 2
  })
  const newPool = available.filter(w => mastery[normalizeWord(w.word)] === undefined)
  const masteredPool = available.filter(w => mastery[normalizeWord(w.word)] === 3)

  addFrom(weakPool, 3, 'weak')
  addFrom(weakTopicPool, 1, 'weak-topic')
  addFrom(newPool, 3, 'new')
  addFrom(learningPool, 2, 'learning')
  addFrom(masteredPool, 1, 'mastered')

  for (const pool of [weakPool, weakTopicPool, learningPool, newPool, masteredPool, available]) {
    if (selected.length >= Math.min(10, available.length)) break
    addFrom(pool, 10, 'fill')
  }

  return selected
}

function normalizeWord(value) {
  return String(value || '').toLowerCase().trim()
}

function normalizeWordList(values) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  const result = []
  for (const value of values) {
    const word = normalizeWord(value)
    if (!word || seen.has(word)) continue
    seen.add(word)
    result.push(word)
  }
  return result
}

function normalizeTopicName(topic) {
  const clean = String(topic || '').trim().replace(/,+$/, '')
  const lower = clean.toLowerCase()
  const aliases = {
    sport: 'Sports',
    sports: 'Sports',
    place: 'Places',
    places: 'Places',
    geographical: 'Places',
    'weather & nature': 'Weather',
    'other verbs': 'Actions',
    verbs: 'Actions',
    'other adjectives': 'Adjectives',
    'personal characteristics': 'Adjectives',
    'sizes & measurements': 'Adjectives',
    'other nouns': 'Other',
  }
  return aliases[lower] || clean || 'Other'
}

function getWeakTopics(available, mastery, wrongWords) {
  const wordToTopic = new Map(available.map(w => [normalizeWord(w.word), normalizeTopicName(w.topic)]))
  const topicScores = new Map()
  const addScore = (word, points) => {
    const topic = wordToTopic.get(normalizeWord(word))
    if (!topic) return
    topicScores.set(topic, (topicScores.get(topic) || 0) + points)
  }

  wrongWords.forEach(word => addScore(word, 3))
  for (const [word, score] of Object.entries(mastery || {})) {
    if (score === 0) addScore(word, 2)
    if (score === 1) addScore(word, 1)
  }

  return [...topicScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([topic]) => topic)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}
