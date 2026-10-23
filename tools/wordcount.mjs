import fs from 'node:fs';

const html = fs.readFileSync('C:\\Users\\29467\\course design\\docs\\report.html', 'utf8');

function section(id) {
  const m = html.match(new RegExp(`<div id="${id}">([\\s\\S]*?)</div>\\s*(?:<!--|<!-- =|<h2|$)`));
  return m ? m[1] : '';
}

function textOf(h) {
  return h
    .replace(/<figure[\s\S]*?<\/figure>/g, ' ')
    .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
    .replace(/<table[\s\S]*?<\/table>/g, ' ')
    .replace(/<div class="codecap">[\s\S]*?<\/div>/g, ' ')
    .replace(/<div class="tablecap">[\s\S]*?<\/div>/g, ' ')
    .replace(/<sup>[\s\S]*?<\/sup>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
}

let totalCJK = 0;
let totalAll = 0;
const titles = { sec1: '一 赛道与产品介绍', sec2: '二 核心技术原理', sec3: '三 领域发展现状', sec4: '四 产品原型设计与实现', sec5: '五 行业与产品展望' };
for (const id of Object.keys(titles)) {
  const t = textOf(section(id)).trim();
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length;
  const all = t.length;
  totalCJK += cjk;
  totalAll += all;
  console.log(`${titles[id]}: 汉字 ${cjk}，字符(含标点/空格) ${all}`);
}
console.log(`\n正文合计：汉字 ${totalCJK}，字符 ${totalAll}`);
