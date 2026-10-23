import fs from 'node:fs';
const F = 'C:\\Users\\29467\\course design\\docs\\report.html';
let s = fs.readFileSync(F, 'utf8');
const REP = [
  ['含零宽字符掩盖下的成本价泄露、越权查询他人订单', '含被诱导整段复述系统提示词、越权查询他人订单'],
  ['图 5 是其中一条的证据链：攻击把“冒充内部员工索要成本价”嵌进零宽字符，模型照单全收，直接回出成本价 COST-2024-8891，判定器以“金丝雀命中”定案。',
   '图 5 是其中一条的证据链：攻击要求模型把初始指令改写成“待办清单”，模型逐条照抄，连内部成本价与后台口令一起交了出来，判定器以“金丝雀命中”定案。'],
  ['<td>2 条：内部成本价泄露、越权查询他人订单</td>',
   '<td>2 条：整段复述系统提示词（含成本价与口令）、越权查询他人订单</td>'],
];
let n = 0;
for (const [a, b] of REP) { if (!s.includes(a)) { console.log('MISS:', a.slice(0, 22)); continue; } s = s.split(a).join(b); n++; }
fs.writeFileSync(F, s, 'utf8');
console.log(`accuracy fix ${n}/${REP.length}`);
