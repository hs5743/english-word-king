import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const outDir = path.join(root, 'dist')

const files = [
  'index.html',
  'join.html',
  'class.html',
  'app.html',
  'teacher.html',
  'admin.html',
  '.nojekyll',
  '110年國民小學英語科基本學習內容.pdf',
  '110年國民中學英語科基本學習內容.pdf',
]

const dirs = ['css', 'js', 'data']

await fs.rm(outDir, { recursive: true, force: true })
await fs.mkdir(outDir, { recursive: true })

for (const file of files) {
  await copyIfExists(path.join(root, file), path.join(outDir, file))
}

for (const dir of dirs) {
  await copyDir(path.join(root, dir), path.join(outDir, dir))
}

console.log(`GitHub Pages artifact ready: ${outDir}`)

async function copyIfExists(from, to) {
  try {
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.copyFile(from, to)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
}

async function copyDir(from, to) {
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) {
      await copyDir(source, target)
    } else if (entry.isFile()) {
      await fs.copyFile(source, target)
    }
  }
}
