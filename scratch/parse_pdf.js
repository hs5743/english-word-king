import fs from 'node:fs';
import * as pdf from 'pdf-parse';

async function run() {
  const parser = new pdf.PDFParse({ url: './GEPTKid_wordlist02.pdf' });
  await parser.load();
  const textObj = await parser.getText();
  
  // Let's inspect the keys and properties of textObj
  console.log('Keys of textObj:', Object.keys(textObj));
  
  // If there's a textObj.text, write it to file
  let text = '';
  if (textObj.text) {
    text = textObj.text;
  } else if (textObj.pages) {
    // If it has pages array with text properties
    text = textObj.pages.map(p => p.text || '').join('\n');
  } else {
    text = JSON.stringify(textObj, null, 2);
  }
  
  fs.writeFileSync('./scratch/gept_ref_extracted.txt', text, 'utf8');
  console.log('Extracted text written to ./scratch/gept_ref_extracted.txt. Size:', text.length);
}

run().catch(console.error);
