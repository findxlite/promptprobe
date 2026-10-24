import fs from 'node:fs';

const R = 'C:\\Users\\29467\\course design\\docs\\report.html';
const C = 'C:\\Users\\29467\\course design\\交付清单.md';

let r = fs.readFileSync(R, 'utf8');
const a = '<li><b>报告</b>：本 PDF（9 页，正文 2193 字，14 篇参考文献，6 图 2 表）。</li>';
const b = '<li><b>报告</b>：本 PDF（11 页，正文 2193 字，14 篇参考文献，6 图 4 表；含分工说明、大模型使用说明、复现说明与有效性验证四个附录）。</li>';
if (r.includes(a)) {
  r = r.split(a).join(b);
  fs.writeFileSync(R, r, 'utf8');
  console.log('[报告] 附录 C.3 的页数与图表数已更新');
} else {
  console.log('[报告] 未找到 C.3 原文，跳过');
}

let c = fs.readFileSync(C, 'utf8');
const ca = '| 9 页（含附录）；正文 2193 字（要求 1800–2200）；14 篇';
const cb = '| 11 页（含 4 个附录）；正文 2193 字（要求 1800–2200）；14 篇';
if (c.includes(ca)) {
  c = c.split(ca).join(cb);
  fs.writeFileSync(C, c, 'utf8');
  console.log('[交付清单] 页数已更新');
} else {
  console.log('[交付清单] 未找到页数描述，跳过');
}
