import fs from 'node:fs';

const F = 'C:\\Users\\29467\\course design\\docs\\report.html';
let s = fs.readFileSync(F, 'utf8');

const OLD = `<h2>附录 C　原型运行与交付说明</h2>
<p class="noindent">交付物为可运行的代码工程包（<i>prototype/</i> 目录）与本地网页原型。运行环境为 Node.js 18 及以上，工程无第三方依赖：进入 <i>prototype</i> 目录执行 <span class="note">node server.js</span>，浏览器访问 <span class="note">http://127.0.0.1:8787</span> 即可使用。未配置模型密钥时自动进入离线模拟演示模式；在 <i>.env</i> 中填入任意 OpenAI 兼容接口的密钥（如 DeepSeek）后即切换为真实大模型红队。完整目录结构、接口列表与自测脚本（<span class="note">node scripts/selftest.js</span>）见工程包内 <i>README.md</i>。</p>`;

const NEW = `<h2>附录 C　原型运行、复现与开源托管说明</h2>

<h3>C.1　代码托管</h3>
<p class="noindent">本作品的全部产物（原型的完整源码、本报告、全部图表、四个受测应用的真实实验原始记录、演示脚本与交付清单）已托管在 GitHub 私有仓库，可通过课程评阅邀请访问：</p>
<p class="noindent" style="font-family:Consolas,monospace;font-size:9.5pt;background:#f6f8fc;border:1px solid #dde4f0;border-radius:4px;padding:7pt 10pt;margin:4pt 0 8pt;">
https://github.com/findxlite/promptprobe
</p>
<p class="noindent">仓库提交记录（对应本报告的各个阶段）：</p>
<ul class="plain" style="font-size:9pt;">
  <li><b>c5fadfc</b>　初始提交：原型源码、报告 PDF/HTML、3 张自制示意图与 3 张真实运行截图、<i>docs/live/</i> 原始实验记录、演示脚本、交付清单（66 个文件）。</li>
  <li><b>5ec9eff</b>　README 补充评分卡、用例证据链与加固前后对比三张实拍截图。</li>
  <li><b>0b47bfc</b>　交付清单同步打包与脱敏状态。</li>
  <li><b>bce6458</b>　.gitignore 忽略打包产物，避免二进制文件进入版本库。</li>
</ul>
<p class="noindent">仓库已做脱敏处理：模型密钥仅保存在本地 <i>.env</i>（已被 <i>.gitignore</i> 排除），仓库内只保留 <i>.env.example</i> 模板；提交前已用全文检索确认版本库中不含任何密钥串。</p>

<h3>C.2　本地复现（三步）</h3>
<p class="noindent"><b>环境：</b>Node.js 18 及以上，Chrome / Edge 任一浏览器；工程<b>零第三方依赖</b>，无需 npm install。</p>
<p class="noindent"><b>第一步（离线模式，无需密钥）：</b></p>
<pre style="font-size:8.4pt;">cd prototype
node server.js          # 看到 "运行模式 离线模拟演示" 即成功
# 浏览器打开 http://127.0.0.1:8787</pre>
<p class="noindent"><b>第二步（真实模式，可复现本报告的表 1）：</b></p>
<pre style="font-size:8.4pt;">copy .env.example .env
# 编辑 .env，填入任意 OpenAI 兼容接口密钥，例如 DeepSeek：
#   LLM_BASE_URL=https://api.deepseek.com/v1
#   LLM_MODEL=deepseek-chat
#   LLM_API_KEY=sk-...
node server.js          # 右上角标识变为 "LIVE · 真实大模型红队"</pre>
<p class="noindent"><b>第三步（一键复现全部实验）：</b></p>
<pre style="font-size:8.4pt;">node scripts/selftest.js          # 4 个应用 × (扫描 + 加固 + 复测)，打印评分卡
node tools/live-run.mjs           # 真实模式批量实验，结果落到 docs/live/</pre>
<p class="noindent">本报告表 1 的每个数字都对应 <i>docs/live/result-*.json</i> 中的一次真实运行（<i>summary.json</i> 为其汇总），图 4–图 6 均为该次运行交互界面的原始截图，可用同一命令、同一随机种子（20251031）与同一 <i>temperature=0</i> 设置复现。</p>

<h3>C.3　交付物清单</h3>
<ul class="plain" style="font-size:9pt;">
  <li><b>报告</b>：本 PDF（8 页，正文 2193 字，14 篇参考文献，6 图 2 表）。</li>
  <li><b>演示材料</b>：可运行代码工程包 <i>prototype.zip</i>（20 个文件，仅含源码与 <i>.env.example</i>，不含任何密钥），满足课程"代码工程包 + 部署运行说明"的要求。</li>
  <li><b>复现材料</b>：<i>docs/live/</i> 下 4 份原始体检报告（Markdown）、4 份完整运行记录（JSON）、1 份汇总表。</li>
  <li><b>运行说明</b>：工程包内 <i>README.md</i>（目录结构、REST 接口一览、两种运行模式、已知局限）。</li>
</ul>`;

if (!s.includes(OLD)) {
  console.log('APPENDIX NOT FOUND');
  process.exit(1);
}
s = s.split(OLD).join(NEW);
fs.writeFileSync(F, s, 'utf8');
console.log('appendix C rewritten');
