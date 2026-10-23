import fs from 'node:fs';
(async () => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const file = process.argv[2];
  const outFile = process.argv[3] || 'text.txt';
  const data = new Uint8Array(fs.readFileSync(file));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    let line = '';
    let lastY = null;
    const parts = [];
    for (const it of tc.items) {
      if (it.str === undefined) continue;
      const y = it.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 3) {
        parts.push(line);
        line = '';
      }
      line += it.str;
      if (it.hasEOL) { parts.push(line); line = ''; }
      lastY = y;
    }
    if (line) parts.push(line);
    out += `\n===== PAGE ${p} =====\n` + parts.join('\n') + '\n';
  }
  fs.writeFileSync(outFile, out, 'utf8');
  console.log('pages:', doc.numPages, 'chars:', out.length);
})();
