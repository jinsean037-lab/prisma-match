// lib/filter.js —— 敏感词过滤器（支持谐音 / 数字 / 字母 / 符号变体）
//
// 策略：三层
//  1) 原文 substring 匹配（最快）
//  2) 文本归一化（去空格/标点、字母数字还原 l33t）后 substring 匹配
//  3) 中文拼音滑动窗口匹配（关键——抓"谐音字"），只对中文部分
//
// 数字谐音/拼音缩写（如"419"）主要靠 layer1/layer2 兜住；
// layer3 只在文本含中文时启动，避免对纯英文/数字串误伤。
//
// 命中后会返回具体敏感词和命中位置，前端可做"高亮"提示。

const { pinyin } = require('pinyin');

let _words = [];          // [{ word, level, pinyin, pinyinNoTone, syllables[] }]
let _wordSet = new Set(); // 原文快速查找
let _pySyllableIndex = new Map(); // 单字拼音(no tone) -> [word, idx]

function load(words) {
  _words = (words || []).map((w) => {
    const word = String(w.word || '').trim();
    if (!word) return null;
    const py = pinyin(word, { style: pinyin.STYLE_NORMAL, heteronym: true });
    // 多音字：用 heteronym 时返回的是 [[..]]，每字一个数组
    const flat = Array.isArray(py[0]) ? py : py.map((x) => [x]);
    const syllables = flat.map((arr) => arr.map((s) => s.replace(/\d/g, '')).filter(Boolean));
    return {
      word,
      level: w.level || 'block',
      syllables, // [["shi"], ["yi", "yi2"...]] => 去声调
    };
  }).filter(Boolean);
  _wordSet = new Set(_words.map((w) => w.word));
  // 单字索引：用于拼音首字母缩写 / 单词命中
  _pySyllableIndex = new Map();
  for (const w of _words) {
    for (const syls of w.syllables) {
      for (const s of syls) {
        const list = _pySyllableIndex.get(s) || [];
        list.push(w);
        _pySyllableIndex.set(s, list);
      }
    }
  }
}

// l33t / 形近还原表（防止简单替换绕过）
const L33T_MAP = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g',
  '@': 'a', '$': 's', '!': 'i', '|': 'l', '¡': 'i',
};

function normalize(text) {
  if (!text) return '';
  let s = String(text).toLowerCase();
  // 还原单字符 l33t
  s = s.split('').map((c) => L33T_MAP[c] || c).join('');
  // 去常见分隔符（包括 * . 等遮蔽符）
  s = s.replace(/[\s\-_.,;:!?·•・。、，,;；:：!！?？'"'"'"""''()()【】\[\]【】「」『』<>《》\\\/|*]/g, '');
  return s;
}

function hasChinese(s) {
  return /[\u4e00-\u9fa5]/.test(s);
}

function tokenizeMixed(text) {
  // 把混合文本拆成"token 流"：
  //   - 中文字符：每个字一个 token，pinyin 为该字读音
  //   - 拉丁字母串（如 fang / kaifang / yuepao）：整个串作为一个 token，
  //     视作可能的拼音"组合音节"
  //   - 数字/其他：跳过
  const out = [];
  const re = /([\u4e00-\u9fa5])|([a-z]+)|([0-9]+)|([^a-z0-9\u4e00-\u9fa5]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) {
      const py = pinyin(m[1], { style: pinyin.STYLE_NORMAL, heteronym: true });
      const arr = Array.isArray(py[0]) ? py[0] : py;
      const pys = arr.map((s) => s.replace(/\d/g, '')).filter(Boolean);
      if (pys.length) out.push({ type: 'cn', text: m[1], py: pys });
    } else if (m[2]) {
      // 拉丁串：整体作为一个"音节"（候选），也按字母拆分成可能的拼音音节
      // 例 "kaifang" → 视为 "kai" + "fang"（尝试按常见拼音音节边界拆）
      const segs = segmentLatinAsPinyin(m[2].toLowerCase());
      out.push({ type: 'latin', text: m[2].toLowerCase(), py: segs });
    }
    // 数字和其他字符忽略
  }
  return out;
}

// 简单实现：按常见拼音音节长度贪心切分拉丁串
// 例 "kaifang" → ["kai", "fang"]；"yuepao" → ["yue", "pao"]；"shanghai" → ["shang","hai"]
const PY_SYLLABLES = [
  'zhuang','shuang','chuang','jiang','qiang','xiang','guang','huang','kuang','liang','niang',
  'shang','chang','zhang','pang','mang','fang','dang','tang','nang','lang','gang','kang','hang','jiang','qiang',
  'wang','zhang','shang','xiang','liang','jiang','qiang','niang',
  'zhai','chai','shai','zhong','sheng','cheng','shang','chang','zhang',
  'qiao','xiao','jiao','bian','mian','nian','lian','jian','qian','xian','tian',
  'shen','zhen','chen','men','fen','gen','hen','ken','nen','pen','ren','sen','wen','zen',
  'shan','zhan','chan','shan','ran','pan','man','fan','dan','tan','nan','lan','gan','kan','han','jian','qian','xian',
  'qing','jing','xing','ying','ning','ling','ping','ming','ding','ting','ning','ling',
  'zhong','sheng','cheng','shang','chang','zhang','shang',
  'bai','cai','dai','gai','hai','kai','lai','mai','nai','pai','qiai','sai','tai','wai','xai','yai','zai',
  'ban','can','dan','fan','gan','han','jian','kan','lan','man','nan','pan','qian','ran','san','tan','wan','xian','yan','zan',
  'bao','cao','dao','fao','gao','hao','jiao','kao','lao','mao','nao','pao','qiao','rao','sao','tao','wao','xiao','yao','zao',
  'bei','cei','dei','fei','gei','hei','kei','lei','mei','nei','pei','qei','rei','sei','tei','wei','xei','yei','zei',
  'ben','cen','den','fen','gen','hen','ken','len','men','nen','pen','qen','ren','sen','ten','wen','xen','yen','zen',
  'ang','eng','ing','ong','ang','eng','ing','ong',
  'a','o','e','i','u','v','ai','ei','ui','ao','ou','iu','ie','ve','er','an','en','in','un','vn','ang','eng','ing','ong',
  'ba','ca','da','fa','ga','ha','ja','ka','la','ma','na','pa','qa','ra','sa','ta','wa','xa','ya','za',
  'bo','co','do','fo','go','ho','jo','ko','lo','mo','no','po','qo','ro','so','to','wo','xo','yo','zo',
  'bi','ci','di','fi','gi','hi','ji','ki','li','mi','ni','pi','qi','ri','si','ti','wi','xi','yi','zi',
  'bu','cu','du','fu','gu','hu','ju','ku','lu','mu','nu','pu','qu','ru','su','tu','wu','xu','yu','zu',
];

function segmentLatinAsPinyin(s) {
  // 贪心切：从最长音节开始匹配
  if (!s) return [];
  const out = [];
  let i = 0;
  while (i < s.length) {
    let matched = false;
    for (let len = Math.min(6, s.length - i); len >= 1; len--) {
      const cand = s.slice(i, i + len);
      if (PY_SYLLABLES.includes(cand)) {
        out.push(cand);
        i += len;
        matched = true;
        break;
      }
    }
    if (!matched) {
      // 单字母兜底
      out.push(s[i]);
      i += 1;
    }
  }
  return out;
}

// 主入口
function check(text) {
  if (!text) return { hit: false, block: false, matches: [], normalized: '' };
  const normalized = normalize(text);
  const matches = [];

  // Layer 1：原文 substring（最严格：完全一致才算）
  for (const w of _words) {
    if (text.includes(w.word)) {
      matches.push({ word: w.word, level: w.level, layer: 'raw' });
    }
  }

  // Layer 2：归一化后 substring（抓 l33t / 加空格 / 拆字等）
  if (matches.length === 0) {
    for (const w of _words) {
      const wn = normalize(w.word);
      if (wn && wn.length >= 2 && normalized.includes(wn)) {
        matches.push({ word: w.word, level: w.level, layer: 'normalized' });
      }
    }
  }

  // Layer 3：拼音滑动窗口（处理"中文字 + 拉丁字母拼音"的混合形式）
  // 例：
  //   "开 fang 吧"  → 中:开(kai) / lat:fang(fang) / 中:吧(ba) → 命中"开房"
  //   "kaifang"     → lat:kaifang → 切分 kai+fang → 命中
  if (matches.length === 0) {
    const tokens = tokenizeMixed(text);
    if (tokens.length > 0) {
      for (const w of _words) {
        if (w.syllables.length < 2) continue;
        if (matches.some((m) => m.word === w.word)) continue;
        // 在 token 流中找连续子序列匹配 w.syllables
        // 中文 token 的 py 数组直接和 syllables[k] 交集；
        // 拉丁 token 的 py 是切分后的音节数组，需展开成"扁平音节流"再匹配
        const stream = [];
        for (const t of tokens) {
          if (t.type === 'cn') {
            stream.push(t.py);
          } else if (t.type === 'latin') {
            for (const s of t.py) stream.push([s]);
          }
        }
        if (stream.length < w.syllables.length) continue;
        outer: for (let i = 0; i <= stream.length - w.syllables.length; i++) {
          for (let k = 0; k < w.syllables.length; k++) {
            const cand = w.syllables[k];
            if (!cand.some((s) => stream[i + k].includes(s))) continue outer;
          }
          matches.push({ word: w.word, level: w.level, layer: 'pinyin' });
          break;
        }
      }
    }
  }

  const block = matches.some((m) => m.level === 'block');
  return {
    hit: matches.length > 0,
    block,
    matches,
    normalized,
  };
}

function guard(text) {
  return check(text);
}

module.exports = { load, check, guard, normalize };
