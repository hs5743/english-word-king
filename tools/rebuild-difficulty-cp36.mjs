import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const vocabularyPath = path.join(root, 'data', 'vocabulary.json')
const reviewPath = path.join(root, 'data', 'difficulty-reviewed-cp36.json')
const reportPath = path.join(root, 'reports', 'cp36', 'difficulty-audit-cp36.json')
const shouldWrite = process.argv.includes('--write')
const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'))

const BANDS = [
  { min: 1, max: 2, id: 'starter', zh: '入門' },
  { min: 3, max: 4, id: 'foundation', zh: '基礎' },
  { min: 5, max: 6, id: 'core', zh: '進階' },
  { min: 7, max: 8, id: 'challenge', zh: '挑戰' },
]

const TOPIC_BASE = {
  Numbers: 2, Colors: 2, Family: 3, Animals: 3, Body: 3, School: 4,
  Food: 4, House: 4, Clothing: 4, Pronouns: 4, Articles: 4,
  'Be & Auxiliaries': 4, 'Wh-words': 4, Actions: 5, Weather: 5,
  Sports: 5, Time: 5, Transportation: 5, Place: 5, Places: 5,
  Adjectives: 5, Interjections: 5, People: 5, Tableware: 5,
  Prepositions: 6, Occupations: 6, Personal: 6, Health: 6,
  'Personal characteristics': 6, 'Sizes & measurements': 6,
  Geographical: 7, 'Other adverbs': 7, Conjunctions: 7, Money: 7,
  Forms: 8, Other: 7, 'Other verbs': 7, 'Other nouns': 7,
  'Other adjectives': 7, 'Weather & nature': 6,
}

const MANUAL = new Map()
function at(level, words) {
  for (const word of words.split(',').map(x => x.trim()).filter(Boolean)) {
    MANUAL.set(word.toLowerCase(), level)
  }
}

// Codex 直接審查的錨點詞：先固定最常用核心詞與高語法負擔詞，
// 其餘再套用一致的語義、拼寫、音節與詞形規準。
at(1, 'a,an,the,I,you,he,she,it,we,they,my,your,yes,no,hi,hello,goodbye,one,two,three,red,blue,green,cat,dog,book,pen,is,am,are')
at(1, 'name')
at(2, 'four,five,six,seven,eight,nine,ten,black,white,yellow,brown,pink,apple,banana,milk,water,rice,egg,bread,boy,girl,man,woman,mom,mother,dad,father,hand,eye,ear,head,foot,fish,bird,pig,cow,duck,bear,desk,chair,bag,box,big,small,good,bad,hot,cold,at,in,on,to,of,for,by,up,out,off,from')
at(3, 'happy,sad,young,old,new,tall,short,fast,slow,teacher,student,school,class,friend,home,house,room,door,window,table,bed,bike,bus,car,run,jump,walk,eat,drink,read,write,sing,play,like,love,want,see,look,come,go,here,there,today,now,near,over,with,under,about,and,but,or,so,Mr,Mrs,Miss/Ms')
at(4, 'beautiful,handsome,sunny,rainy,morning,afternoon,evening,night,brother,sister,family,parent,doctor,nurse,library,kitchen,bathroom,bedroom,living room,shirt,skirt,T-shirt,shoes,pants,breakfast,lunch,dinner,noodle,noodles,tomato,cheese,coffee,watermelon,basketball,cellphone,favorite,together')
at(5, 'homework,supermarket,hospital,restaurant,station,airport,computer,telephone,phone,weekend,birthday,holiday,weather,season,summer,winter,spring,autumn,always,usually,sometimes,never')
at(5, 'mountain,volcano,Halloween,festival,toothache,headache,refrigerator,Philippines,Singapore,motorcycle,police officer,post office,fire station,movie theater,police station,excuse me')
at(6, 'difficult,important,interesting,popular,healthy,hungry,thirsty,tired,excited,practice,subject,question,answer,remember,finish,invite,teach,learn,department store')
at(7, 'across,along,before,after,between,behind,beside,inside,outside,without,around,through,already,also,often,since,everyone,expensive,wore,caught,felt,found,grew,heard,stood,thought')
at(5, 'favorite,together,because')
at(8, 'different,enough,however,although,while,during,should,would,could')
at(9, 'been')
at(11, 'flown,grown,known,spoken,written')

function syllables(word) {
  return (word.toLowerCase().match(/[aeiouy]+/g) || []).length || 1
}

function inferLevel(item) {
  const key = String(item.word || '').toLowerCase().trim()
  let score
  let method = 'rubric'
  if (MANUAL.has(key)) {
    score = MANUAL.get(key)
    method = 'direct-anchor'
  } else {
    score = TOPIC_BASE[item.topic] || 6
    const compact = key.replace(/[^a-z]/g, '')
    const syllableCount = syllables(key)
    if (compact.length >= 7) score += 1
    if (compact.length >= 10) score += 1
    if (syllableCount >= 3) score += 1
    if (syllableCount >= 4) score += 1
    if (/\s|-|\//.test(key)) score += 1
    if (/past participle|過去分詞/i.test(`${item.partOfSpeech || ''} ${item.zh || ''}`)) score += 3
    else if (/過去式/i.test(item.zh || '')) score += 2
    if (/conjunction|preposition\/conjunction|modal/i.test(item.partOfSpeech || '')) score += 1
    if (/proper noun/i.test(item.partOfSpeech || '')) score = Math.max(score, 5)
  }

  // 單字採 8 級教育難度；16 級寶石屬於學生熟練進程，兩者分離。
  const level = score <= 1 ? 1
    : score <= 3 ? 2
      : score === 4 ? 3
        : score === 5 ? 4
          : score === 6 ? 5
            : score === 7 ? 6
              : score <= 9 ? 7
                : 8
  return { level, rubricScore: score, method }
}

const entries = []
for (const item of vocabulary.filter(x => x.enabled !== false)) {
  const result = inferLevel(item)
  const band = BANDS.find(x => result.level >= x.min && result.level <= x.max)
  entries.push({
    word: item.word,
    senseId: item.senseId,
    level: result.level,
    rubricScore: result.rubricScore,
    band: band.id,
    bandZh: band.zh,
    method: result.method,
    previous: { grade: item.grade, gradeBand: item.gradeBand, difficultyLevel: item.difficultyLevel },
  })
}

const levelCounts = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [i + 1, entries.filter(x => x.level === i + 1).length]))
const bandCounts = Object.fromEntries(BANDS.map(b => [b.id, entries.filter(x => x.band === b.id).length]))
const report = {
  schema: 'cp36-difficulty-review-v1',
  generatedAt: new Date().toISOString(),
  reviewer: 'Codex',
  enabledWords: entries.length,
  levelCounts,
  bandCounts,
  directAnchors: entries.filter(x => x.method === 'direct-anchor').length,
  changedLevels: entries.filter(x => x.previous.difficultyLevel !== x.level).length,
  entries,
}

if (shouldWrite) {
  const bySense = new Map(entries.map(x => [x.senseId, x]))
  const updated = vocabulary.map(item => {
    if (item.enabled === false) return item
    const review = bySense.get(item.senseId)
    if (!review) throw new Error(`Missing difficulty review: ${item.word}`)
    return {
      ...item,
      difficultyLevel: review.level,
      difficultyBand: review.band,
      difficultyBandZh: review.bandZh,
      difficultyReview: {
        status: 'approved',
        version: 'cp36-v1',
        reviewer: 'Codex',
        reviewedAt: '2026-07-13',
        method: review.method,
        previousGrade: review.previous.grade,
        previousGradeBand: review.previous.gradeBand,
        previousLevel: review.previous.difficultyLevel,
      },
    }
  })
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(vocabularyPath, `${JSON.stringify(updated, null, 2)}\n`)
  fs.writeFileSync(reviewPath, `${JSON.stringify({ ...report, entries }, null, 2)}\n`)
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
}

console.log(JSON.stringify({
  enabledWords: report.enabledWords,
  levelCounts,
  bandCounts,
  directAnchors: report.directAnchors,
  changedLevels: report.changedLevels,
  upperLevels: Object.fromEntries(Array.from({ length: 2 }, (_, i) => {
    const level = i + 7
    return [level, entries.filter(x => x.level === level).map(x => x.word)]
  })),
  write: shouldWrite,
}, null, 2))

if (process.argv.includes('--list')) {
  for (let level = 1; level <= 8; level += 1) {
    console.log(`\nLEVEL ${level} (${entries.filter(x => x.level === level).length})`)
    console.log(entries.filter(x => x.level === level).map(x => x.word).join(', '))
  }
}
