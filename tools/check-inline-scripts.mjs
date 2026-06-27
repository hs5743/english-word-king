import fs from 'node:fs'

const htmlFiles = ['index.html', 'join.html', 'class.html', 'app.html', 'teacher.html', 'admin.html']
let hasError = false

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8')
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])

  scripts.forEach((script, index) => {
    try {
      new Function(script)
    } catch (err) {
      hasError = true
      console.error(`${file} inline script ${index + 1}: ${err.message}`)
    }
  })
}

if (hasError) {
  process.exit(1)
}

console.log('Inline scripts OK')
