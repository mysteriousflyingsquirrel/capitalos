const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

async function extractPDFText(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const loadingTask = pdfjsLib.getDocument({ data: dataBuffer });
    const pdfDocument = await loadingTask.promise;
    let fullText = '';

    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
    }

    return fullText;
  } catch (error) {
    return `Error reading ${filePath}: ${error.message}\n${error.stack}`;
  }
}

async function main() {
  const pdfs = [
    'Capitalos_Free_Architecture.pdf',
    'Capitalos_Key_Requirements.pdf',
    'Capitalos_Layout_Proposal.pdf',
    'Capitalos_UI_Style_Guide.pdf'
  ];

  for (const pdfFile of pdfs) {
    console.log(`\n=== ${pdfFile} ===\n`);
    const text = await extractPDFText(pdfFile);
    console.log(text);
    console.log('\n' + '='.repeat(50));
  }
}

main().catch(console.error);
