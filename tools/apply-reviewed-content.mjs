import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vocabularyPath = path.join(root, 'data', 'vocabulary.json');
const reviewedPath = path.join(root, 'data', 'content-reviewed-cp35.json');
const shouldWrite = process.argv.includes('--write');
const vocabulary = JSON.parse(fs.readFileSync(vocabularyPath, 'utf8'));
const reviewed = JSON.parse(fs.readFileSync(reviewedPath, 'utf8'));
const entries = reviewed.batches.flatMap((batch) =>
  batch.entries.map((entry) => ({ ...entry, batchId: batch.id, reviewedAt: batch.reviewedAt }))
);

const duplicateWords = entries.filter((entry, index) =>
  entries.findIndex((candidate) => candidate.word === entry.word) !== index
);
if (duplicateWords.length) throw new Error(`Duplicate reviewed words: ${duplicateWords.map((item) => item.word).join(', ')}`);

let applied = 0;
for (const entry of entries) {
  const sourceWord = entry.sourceWord || entry.word;
  const matches = vocabulary.filter((item) =>
    (item.word === sourceWord || (item.contentReview?.status === 'approved' && item.word === entry.word)) && item.enabled !== false
  );
  if (matches.length !== 1) throw new Error(`${entry.word}: expected one enabled vocabulary item, found ${matches.length}`);
  const item = matches[0];
  if (entry.legacyReviewed === true && entry.thirdExample) {
    entry.examples = [
      { en: item?.sentence, zhTw: item?.sentenceZh, target: entry.legacyTargets?.[0] || entry.word },
      { en: item?.sentence2, zhTw: item?.sentence2Zh, target: entry.legacyTargets?.[1] || entry.word },
      entry.thirdExample
    ];
  }
  if (!Array.isArray(entry.examples) || entry.examples.length !== 3) {
    throw new Error(`${entry.word}: exactly three reviewed examples are required`);
  }
  const normalizeMeaning = (value) => String(value).replaceAll('／', '/').replace(/\s+/g, '');
  const expectedSourceMeaning = entry.sourceZh || entry.zh;
  if (normalizeMeaning(item.zh) !== normalizeMeaning(expectedSourceMeaning) && item.contentReview?.status !== 'approved') {
    throw new Error(`${entry.word}: reviewed Chinese meaning does not match vocabulary (${item.zh} !== ${expectedSourceMeaning})`);
  }
  entry.examples.forEach((example, index) => {
    for (const field of ['en', 'zhTw', 'target']) {
      if (!String(example[field] || '').trim()) throw new Error(`${entry.word} example ${index + 1}: missing ${field}`);
    }
    if (!example.en.toLocaleLowerCase('en-US').includes(example.target.toLocaleLowerCase('en-US'))) {
      throw new Error(`${entry.word} example ${index + 1}: target form is not present in the sentence`);
    }
  });
  item.contentSchemaVersion = 2;
  item.word = entry.word;
  item.zh = entry.zh;
  item.partOfSpeech = entry.partOfSpeech;
  item.semanticGroup = entry.semanticGroup;
  item.contentReview = { status: 'approved', reviewer: reviewed.reviewer, batchId: entry.batchId, reviewedAt: entry.reviewedAt };
  item.examples = entry.examples.map((example, index) => ({
    id: `${item.senseId || item.id || entry.word}-ex${index + 1}`,
    en: example.en,
    zhTw: example.zhTw,
    target: example.target,
    reviewStatus: 'approved',
    contentVersion: 2
  }));
  [item.sentence, item.sentence2] = item.examples.map((example) => example.en);
  [item.sentenceZh, item.sentence2Zh] = item.examples.map((example) => example.zhTw);
  applied += 1;
}

if (shouldWrite) fs.writeFileSync(vocabularyPath, `${JSON.stringify(vocabulary, null, 2)}\n`, 'utf8');
console.log(`${shouldWrite ? 'Applied' : 'Validated'} ${applied} directly reviewed vocabulary entries.`);
