import * as pdf from 'pdf-parse';

async function run() {
  const parser = new pdf.PDFParse({ url: './GEPTKid_wordlist02.pdf' });
  await parser.load();
  const text = await parser.getText();
  console.log('text type:', typeof text);
  console.log('text keys:', Object.keys(text));
  console.log('text values:', text);
}

run().catch(console.error);
