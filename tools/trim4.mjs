import fs from 'node:fs';

const F = 'C:\\Users\\29467\\course design\\docs\\report.html';
let s = fs.readFileSync(F, 'utf8');

const REP = [
  ['，误报率为 0，单例 p50 约 1.5 秒。', '，误报率为 0。'],
  ['判定既要准又要可解释，故分两层。', '判定要准且可解释，故分两层。'],
  ['。结论相当一致：不存在“免疫”的提示词。', '。'],
  ['；含汉字的 6-gram 命中 3 处以上判拼接式泄露', ''],
];

let n = 0;
for (const [a, b] of REP) {
  if (!s.includes(a)) {
    console.log('MISS:', a.slice(0, 24));
    continue;
  }
  s = s.split(a).join(b);
  n++;
}
fs.writeFileSync(F, s, 'utf8');
console.log(`trim4 ${n}/${REP.length}`);
