import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const vocabularyPath = path.join(root, 'data', 'vocabulary.json')
const patternsPath = path.join(root, 'data', 'sentence-patterns.json')

const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))
const patterns = JSON.parse(fs.readFileSync(patternsPath, 'utf8'))

const simplifiedChars = new Set(Array.from(
  '\u4e2a\u4eec\u4e60\u4e66\u4e70\u53d1\u53d8\u53f6\u542c\u5458\u56ed\u56fe\u573a\u5757\u58f0\u5904\u5907\u590d\u5934\u5988\u5b66\u5b9e\u5bf9\u5c42\u5e08\u5e26\u5e94\u5f00\u5f20\u5f53\u603b\u7231\u65e7\u65f6\u673a\u6765\u6781\u6837\u6865\u697c\u6c14\u6c49\u6ca1\u6d01\u6d4b\u6d4e\u6d53\u6e29\u6ee1\u706f\u70b9\u70ed\u7535\u753b\u79cd\u79ef\u7b14\u7b80\u7eb8\u7ecf\u7ed9\u7ed3\u7ee7\u7eed\u7f51\u8054\u8111\u8138\u89c1\u89c2\u89c6\u89c9\u8ba4\u8ba9\u8bb0\u8bb2\u8bb8\u8bba\u8bcd\u8bd5\u8bdd\u8bed\u8bf4\u8bf7\u8bfb\u8bfe\u8c01\u8c22\u8d1d\u8d1f\u8d28\u8d2d\u8d35\u8d5b\u8d5e\u8f66\u8f6c\u8f7b\u8fdb\u8fd9\u8fdc\u9009\u91cc\u95e8\u95ee\u95f4\u961f\u9633\u96be\u9759\u9875\u9898\u98ce\u98de\u996d\u996e\u9a6c\u9c7c\u9e1f'
))

const suspiciousEnglishPatterns = [
  /\bI see (a|an) \w+\.?$/i,
  /\bI can see (a|an) \w+\.?$/i,
  /\bbrand of\b/i,
  /\blogo on\b/i,
  /\bI see (a|an) (my|your|his|her|our|their|than)\b/i,
  /\bI am wearing (a|an) (wear|pants)\b/i,
]

function hasSimplified(text = '') {
  return Array.from(String(text)).some(ch => simplifiedChars.has(ch))
}

function hasSuspiciousEnglish(text = '') {
  return suspiciousEnglishPatterns.some(pattern => pattern.test(String(text)))
}

function row(issue, item, extra = '') {
  return {
    issue,
    word: item.word || item.id || '',
    zh: item.zh || '',
    sentence: item.sentence || item.exampleSentence || item.pattern || '',
    sentenceZh: item.sentenceZh || '',
    extra,
  }
}

const findings = []

for (const item of vocabulary) {
  if (item.needsReview) findings.push(row('needsReview', item))
  if (hasSimplified(item.sentenceZh)) findings.push(row('simplifiedZh', item))
  if (hasSuspiciousEnglish(item.sentence)) findings.push(row('suspiciousEnglish', item))
}

for (const item of patterns) {
  const sentence = item.sentence || item.exampleSentence || item.pattern || ''
  if (hasSimplified(item.sentenceZh)) findings.push(row('patternSimplifiedZh', item))
  if (hasSuspiciousEnglish(sentence)) findings.push(row('patternSuspiciousEnglish', item, item.id || ''))
}

const grouped = findings.reduce((acc, item) => {
  acc[item.issue] = (acc[item.issue] || 0) + 1
  return acc
}, {})

console.log('Sentence quality audit')
console.log(JSON.stringify(grouped, null, 2))
console.log('')
console.table(findings.slice(0, 80))

if (findings.length > 80) {
  console.log(`... ${findings.length - 80} more findings not shown`)
}
