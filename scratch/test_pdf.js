import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const pdf = require('pdf-parse');
console.log('PDFParse constructor:', pdf.PDFParse.toString());
