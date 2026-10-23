import fs from 'node:fs';

const F = 'C:\\Users\\29467\\course design\\docs\\report.html';
let s = fs.readFileSync(F, 'utf8');

const oldTable = `<table>
  <thead>
    <tr><th style="width:26%">受测应用（行业）</th><th>加固前 评分 / ASR</th><th>加固后 评分 / ASR</th><th>误报率</th><th>判定器 P / R / F1</th></tr>
  </thead>
  <tbody>
    <tr><td>星火商城·客服小星（电商零售）</td><td class="num">34 / 66.7%</td><td class="num">86 / 12.5%</td><td class="num">0.0%</td><td class="num">1.00 / 0.89 / 0.94</td></tr>
    <tr><td>青藤教务·学业助手（高校教务）</td><td class="num">42 / 62.5%</td><td class="num">100 / 0.0%</td><td class="num">0.0%</td><td class="num">1.00 / 1.00 / 1.00</td></tr>
    <tr><td>CodeMentor·代码助手（开发者工具）</td><td class="num">37 / 66.7%</td><td class="num">96 / 4.2%</td><td class="num">0.0%</td><td class="num">1.00 / 1.00 / 1.00</td></tr>
  </tbody>
</table>`;

const newTable = `<table>
  <thead>
    <tr><th style="width:24%">受测应用（行业）</th><th>加固前 评分 / ASR</th><th>加固后 评分 / ASR</th><th>误报率</th><th style="width:26%">真实攻破的用例</th></tr>
  </thead>
  <tbody>
    <tr><td>星火商城·客服小星（电商零售）</td><td class="num">100 / 0.0%</td><td class="num">100 / 0.0%</td><td class="num">0.0%</td><td>无，基线即通过</td></tr>
    <tr><td>青藤教务·学业助手（高校教务）</td><td class="num">100 / 0.0%</td><td class="num">100 / 0.0%</td><td class="num">0.0%</td><td>无，基线即通过</td></tr>
    <tr><td>CodeMentor·代码助手（开发者工具）</td><td class="num">97 / 4.2%</td><td class="num">100 / 0.0%</td><td class="num">0.0%</td><td>1 条：被“改写成待办清单”后逐条复述了内部规则</td></tr>
    <tr><td>跳蚤街·二手交易客服（校园二手交易）</td><td class="num">90 / 8.3%</td><td class="num">100 / 0.0%</td><td class="num">0.0%</td><td>2 条：内部成本价泄露、越权查询他人订单</td></tr>
  </tbody>
</table>`;

if (!s.includes(oldTable)) {
  console.log('TABLE NOT FOUND');
} else {
  s = s.split(oldTable).join(newTable);
  fs.writeFileSync(F, s, 'utf8');
  console.log('table replaced');
}
