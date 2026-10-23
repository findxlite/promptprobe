import fs from 'node:fs';

const jobs = [
  ['C:\\Users\\29467\\course design\\docs\\report.html',
    '<li><b>报告</b>：本 PDF（8 页，正文 2193 字，14 篇参考文献，6 图 2 表）。</li>',
    '<li><b>报告</b>：本 PDF（9 页，正文 2193 字，14 篇参考文献，6 图 2 表）。</li>'],
  ['C:\\Users\\29467\\course design\\交付清单.md',
    '| 8 页；正文 2193 字（要求 1800–2200）；14 篇',
    '| 9 页（含附录）；正文 2193 字（要求 1800–2200）；14 篇'],
];
for (const [f, a, b] of jobs) {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes(a)) { console.log('MISS', f.split('\\').pop()); continue; }
  s = s.split(a).join(b);
  fs.writeFileSync(f, s, 'utf8');
  console.log('patched', f.split('\\').pop());
}
