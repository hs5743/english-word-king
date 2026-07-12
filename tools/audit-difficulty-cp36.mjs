import fs from 'node:fs'

const vocabulary = JSON.parse(fs.readFileSync('data/vocabulary.json', 'utf8'))
const enabled = vocabulary.filter(item => item.enabled !== false)
const issues = []
const expectedBand = level => level <= 2 ? 'starter' : level <= 4 ? 'foundation' : level <= 6 ? 'core' : 'challenge'

for (const item of enabled) {
  if (!Number.isInteger(item.difficultyLevel) || item.difficultyLevel < 1 || item.difficultyLevel > 8) {
    issues.push({ word: item.word, type: 'invalid_level', value: item.difficultyLevel })
  }
  if (item.difficultyBand !== expectedBand(item.difficultyLevel)) {
    issues.push({ word: item.word, type: 'band_mismatch', value: item.difficultyBand })
  }
  if (item.difficultyReview?.status !== 'approved' || item.difficultyReview?.version !== 'cp36-v1') {
    issues.push({ word: item.word, type: 'unapproved_review' })
  }
  if (!Number.isInteger(item.difficultyReview?.previousLevel)) {
    issues.push({ word: item.word, type: 'missing_legacy_trace' })
  }
}

const anchors = { happy: 2, apple: 2, book: 1, beautiful: 3, already: 6, been: 7, written: 8 }
for (const [word, level] of Object.entries(anchors)) {
  const item = enabled.find(entry => entry.word.toLowerCase() === word)
  if (!item || item.difficultyLevel !== level) {
    issues.push({ word, type: 'anchor_mismatch', expected: level, actual: item?.difficultyLevel })
  }
}

const levelCounts = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, enabled.filter(item => item.difficultyLevel === i + 1).length]))
const bandCounts = Object.fromEntries(['starter', 'foundation', 'core', 'challenge'].map(band => [band, enabled.filter(item => item.difficultyBand === band).length]))
for (let level = 1; level <= 8; level += 1) {
  if (levelCounts[level] === 0) issues.push({ type: 'empty_level', level })
}

console.log(JSON.stringify({ schema: 'cp36-difficulty-audit-v1', enabledWords: enabled.length, levelCounts, bandCounts, issues }, null, 2))
if (issues.length) process.exit(1)
