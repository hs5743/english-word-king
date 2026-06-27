import fs from 'node:fs'

const jsonFiles = ['data/vocabulary.json', 'data/sentence-patterns.json']

for (const file of jsonFiles) {
  JSON.parse(fs.readFileSync(file, 'utf8'))
}

console.log('JSON OK')
