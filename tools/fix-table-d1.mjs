import fs from 'node:fs';

const F = 'C:\\Users\\29467\\course design\\docs\\report.html';
let s = fs.readFileSync(F, 'utf8');

const oldHead =
  '<tr><th style="width:14%">组别</th><th style="width:34%">提示词特征</th><th>用例</th><th>攻破</th><th>ASR</th><th>评分</th><th style="width:24%">工具报出的问题</th></tr>';
const newHead =
  '<tr><th style="width:12%">组别</th><th style="width:30%">提示词特征</th><th style="width:7%">用例</th><th style="width:7%">攻破</th><th style="width:9%">ASR</th><th style="width:10%">评分</th><th>工具报出的问题</th></tr>';

if (!s.includes(oldHead)) {
  console.log('表头未匹配');
  process.exit(1);
}
s = s.split(oldHead).join(newHead);

// 表头不换行，避免"用例/攻破"被竖排
if (!s.includes('table th { white-space: nowrap }')) {
  s = s.replace('th { background: #eef2f9;', 'table th { white-space: nowrap; }\n  th { background: #eef2f9;');
}

fs.writeFileSync(F, s, 'utf8');
console.log('表 D-1 列宽与表头换行已调整');
