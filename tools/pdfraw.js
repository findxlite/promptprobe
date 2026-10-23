// Minimal PDF stream dumper: inflate FlateDecode streams and print text-ish content.
const fs = require('fs');
const zlib = require('zlib');

const file = process.argv[2];
const out = process.argv[3] || 'pdfstreams.txt';
const buf = fs.readFileSync(file);

let pos = 0;
let idx = 0;
const chunks = [];
while (true) {
  const s = buf.indexOf('stream', pos);
  if (s < 0) break;
  // find dictionary start
  let d = s;
  while (d > 0 && buf.toString('latin1', d, d + 2) !== '<<') d--;
  const dict = buf.toString('latin1', d, s);
  // stream data start: skip EOL after 'stream'
  let ds = s + 6;
  if (buf[ds] === 0x0d) ds++;
  if (buf[ds] === 0x0a) ds++;
  const e = buf.indexOf('endstream', ds);
  if (e < 0) break;
  const raw = buf.subarray(ds, e);
  let data = null;
  if (/FlateDecode/.test(dict)) {
    try { data = zlib.inflateSync(raw); } catch (err) {
      try { data = zlib.inflateRawSync(raw.subarray(0)); } catch (e2) { data = null; }
    }
  } else if (!/Filter/.test(dict)) {
    data = raw;
  }
  if (data) {
    chunks.push('===== stream ' + (idx++) + ' =====\n' + dict.slice(0, 300) + '\n---\n' + data.toString('latin1'));
  }
  pos = e + 9;
}
fs.writeFileSync(out, chunks.join('\n'), 'latin1');
console.log('streams written:', chunks.length, 'bytes:', fs.statSync(out).size);
