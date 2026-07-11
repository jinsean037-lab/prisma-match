// scripts/test-filter.js —— 敏感词过滤器自检（用内置 dev 词库）
const filter = require('../lib/filter');

// 内置 dev 词库（覆盖测试用例所需 + 一些常见变体）
filter.load([
  { word: '419', level: 'block' },
  { word: '3p', level: 'block' },
  { word: 'yp', level: 'review' },
  { word: 'porn', level: 'block' },
  { word: 'fuck', level: 'block' },
  { word: 'fck', level: 'block' },        // 遮蔽变体（去 *）
  { word: 'fk', level: 'block' },         // 更强遮蔽
  { word: 'bitch', level: 'block' },
  { word: 'btch', level: 'block' },
  { word: '约pao', level: 'block' },
  { word: 'yuepao', level: 'block' },
  { word: '开房', level: 'block' },
  { word: 'kaifang', level: 'block' },
  { word: '一夜情', level: 'block' },
  { word: '援交', level: 'block' },
  { word: '嫖娼', level: 'block' },
  { word: '自慰', level: 'block' },
  { word: '手淫', level: 'block' },
  { word: '打飞机', level: 'block' },
  { word: '裸聊', level: 'block' },
  { word: '春药', level: 'block' },
  { word: '冰毒', level: 'block' },
  { word: '大麻', level: 'block' },
]);

const cases = [
  ['hello world', false],
  ['你好世界', false],
  ['我们去看电影吧', false],
  ['约 炮 加 微信', true],   // 加空格也不能绕过
  ['我 们 去 开 fang 吧', true], // 拼音字母+中文
  ['419 吗', true],
  ['我们聊聊 3p', true],
  ['加 我 yue pao', true],
  ['f*ck off', true],
  ['b1tch', true],
  ['just a normal chat', false],
  ['做个好朋友吧', false],
  ['周六看电影？', false],
  ['约pao不？', true],
  ['yue pao 加我', true],
  ['我yp 你', true],
  ['F**k this', true],
  ['p0rn 网站', true],
];

let pass = 0, fail = 0;
for (const [text, expectHit] of cases) {
  const r = filter.check(text);
  const ok = r.hit === expectHit;
  if (ok) pass++; else fail++;
  const tag = r.matches.map((m) => `${m.word}:${m.layer}`).join(', ');
  console.log(`${ok ? '✓' : '✗'}  hit=${r.hit}  expected=${expectHit}  text="${text}"  [${tag}]`);
}
console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
