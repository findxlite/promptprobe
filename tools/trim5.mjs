import fs from 'node:fs';
const F = 'C:\\Users\\29467\\course design\\docs\\report.html';
let s = fs.readFileSync(F, 'utf8');
const REP = [
  ['24 条用例中 2 条成功，误报率为 0。', '24 条用例中 2 条成功，误报 0。'],
  ['同时把伦理边界写进设计——仅限授权测试、内置虚构靶场、明确标注模拟与真实之别。',
   '并把伦理边界写进设计：仅限授权测试、内置虚构靶场、标注模拟与真实之别。'],
  ['威胁被映射为四类用例族：', '威胁分四类用例族：'],
  ['系统提示词泄露（LLM07）。模板占位符', '提示词泄露（LLM07）。模板占位符'],
  ['工具调用把自然语言直接变成订单查询、考勤修改甚至命令执行。', '工具调用把自然语言变成订单查询、考勤修改甚至命令执行。'],
  ['图 6 为同集复测：加固后 ASR 由 8.3% 降至 0，评分升至 100。', '图 6 为同集复测：ASR 由 8.3% 降至 0，评分升至 100。'],
];
let n = 0;
for (const [a, b] of REP) { if (!s.includes(a)) { console.log('MISS:', a.slice(0, 20)); continue; } s = s.split(a).join(b); n++; }
fs.writeFileSync(F, s, 'utf8');
console.log(`trim5 ${n}/${REP.length}`);
