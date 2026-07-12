import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const vocabularyPath = path.join(root, 'data', 'vocabulary.json')
const reportPath = path.join(root, 'reports', 'cp35', 'content-audit-cp35.json')
const strict = process.argv.includes('--strict')
const writeReport = process.argv.includes('--write-report')
const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))

const simplifiedChars = new Set(Array.from(
  '个们习书买发变叶听员园图场块声处备复头妈学实对层师带应开张当总爱旧时机来极样桥楼气汉没洁测济浓温满灯点热电画种积笔简纸经给结继续网联脑脸见观视觉认识让记讲许论词试话语说请读课谁谢贝负质购贵赛赞车转轻进这远选里门问间队阳难静页题风飞饭饮马鱼鸟'
))
simplifiedChars.delete('里')

function hasSimplified(text) {
  return Array.from(String(text || '')).some(char => simplifiedChars.has(char))
}

function normalizedEnglish(text) {
  return String(text || '').toLowerCase().replace(/[’']/g, "'")
}

function targetAppears(example) {
  const sentence = normalizedEnglish(example.en)
  const target = normalizedEnglish(example.target).trim()
  if (!target) return false
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(sentence)
}

const issues = []
const exampleIds = new Set()
let enabledWords = 0
let approvedExamples = 0
let legacyExamples = 0

for (const item of vocabulary) {
  if (item.enabled === false) continue
  enabledWords++
  const examples = Array.isArray(item.examples) ? item.examples : []
  if (examples.length < 3) issues.push({ severity: 'coverage', type: 'missing_examples', word: item.word, count: examples.length })
  if (!item.senseId) issues.push({ severity: 'critical', type: 'missing_sense_id', word: item.word })

  for (const example of examples) {
    const base = { word: item.word, exampleId: example.id || '' }
    if (!example.id) issues.push({ severity: 'critical', type: 'missing_example_id', ...base })
    else if (exampleIds.has(example.id)) issues.push({ severity: 'critical', type: 'duplicate_example_id', ...base })
    else exampleIds.add(example.id)
    if (!example.en || !example.zhTw) issues.push({ severity: 'critical', type: 'unpaired_content', ...base })
    if (!example.target) issues.push({ severity: 'critical', type: 'missing_target', ...base })
    else if (!targetAppears(example)) issues.push({ severity: 'review', type: 'target_form_not_exact', target: example.target, en: example.en, ...base })
    if (hasSimplified(example.zhTw)) issues.push({ severity: 'critical', type: 'simplified_chinese', zhTw: example.zhTw, ...base })
    if (String(example.en || '').split(/\s+/).filter(Boolean).length > 18) issues.push({ severity: 'review', type: 'sentence_too_long', en: example.en, ...base })
    if (example.reviewStatus === 'approved') approvedExamples++
    else legacyExamples++
  }
}

const summary = {
  schema: 'cp35-content-v2',
  generatedAt: new Date().toISOString(),
  words: vocabulary.length,
  enabledWords,
  examples: exampleIds.size,
  approvedExamples,
  unapprovedExamples: legacyExamples,
  issueCounts: issues.reduce((result, issue) => {
    result[issue.type] = (result[issue.type] || 0) + 1
    return result
  }, {}),
  severityCounts: issues.reduce((result, issue) => {
    result[issue.severity] = (result[issue.severity] || 0) + 1
    return result
  }, {}),
}

console.log('CP35 content audit')
console.log(JSON.stringify(summary, null, 2))
console.table(issues.slice(0, 60))
if (issues.length > 60) console.log(`... ${issues.length - 60} more issues in report`)

if (writeReport) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify({ summary, issues }, null, 2)}\n`, 'utf8')
  console.log(`Report written: ${reportPath}`)
}

const criticalCount = summary.severityCounts.critical || 0
const coverageCount = summary.severityCounts.coverage || 0
const unapprovedCount = summary.unapprovedExamples || 0
if (criticalCount > 0 || (strict && (coverageCount > 0 || unapprovedCount > 0))) process.exitCode = 1
