// lib/match.js —— 匹配打分
//
// 思路：基于"双向偏好"做加权相似度。
//   用户 A 设定想找的（prefer）：身高区间、体重区间、MBTI 偏好、星座、爱好重叠度
//   用户 B 设定想找的（prefer）：同上
//   双方都符合 → 双向 hit（权重高）
//   双向都偏向彼此 → 高分
//
// 输出：score (0-100), reasons[]

const HEIGHT_MIN = 130;
const HEIGHT_MAX = 220;
const WEIGHT_MIN = 30;
const WEIGHT_MAX = 150;

// MBTI 兼容矩阵（粗略：T/F 互补、J/P 互补、其余相同或全等更优）
function mbtiCompat(a, b) {
  if (!a || !b) return 0.3;
  if (a === b) return 1.0;
  // 简单相似度：4 个维度相同数
  let same = 0;
  for (let i = 0; i < 4; i++) if (a[i] === b[i]) same++;
  // 互补维度加分（I/E, J/P 这种对立维度）
  const comp = (a[0] !== b[0] ? 0.1 : 0) + (a[3] !== b[3] ? 0.1 : 0);
  return 0.3 + 0.15 * same + comp;
}

// 星座：同象限（风火土水）有天然吸引力
const ELEMENT = {
  '白羊': '火', '狮子': '火', '射手': '火',
  '金牛': '土', '处女': '土', '摩羯': '土',
  '双子': '风', '天平': '风', '水瓶': '风',
  '巨蟹': '水', '天蝎': '水', '双鱼': '水',
};
function zodiacCompat(a, b) {
  if (!a || !b) return 0.3;
  if (a === b) return 1.0;
  const ea = ELEMENT[a], eb = ELEMENT[b];
  if (ea && eb) {
    if (ea === eb) return 0.8;
    // 相邻元素
    const pairs = { 火: '风', 风: '水', 水: '土', 土: '火' };
    if (pairs[ea] === eb) return 0.6;
  }
  return 0.3;
}

// 角色兼容：0↔1 最配；0.5 跟谁都配；side 跟 side 配；0↔0.5、1↔0.5 次之
function roleCompat(a, b) {
  if (!a || !b) return 0.3;
  if (a === 'side' && b === 'side') return 0.7;
  if (a === '0.5' || b === '0.5') return 0.8;
  if (a === b) return 0.4; // 同角色不太配（如 0 配 0）
  if ((a === '0' && b === '1') || (a === '1' && b === '0')) return 1.0;
  return 0.5;
}

// 爱好 Jaccard 相似度
function hobbyScore(a, b) {
  const sa = new Set(a || []);
  const sb = new Set(b || []);
  if (!sa.size && !sb.size) return 0.5;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  const uni = sa.size + sb.size - inter;
  return uni === 0 ? 0.5 : inter / uni;
}

// 身高：在不在对方区间内
function inRange(v, min, max) {
  if (v == null) return 0.3;
  if (min == null && max == null) return 0.5;
  if (min != null && v < min) return 0;
  if (max != null && v > max) return 0;
  return 1.0;
}

function score(a, b) {
  // a: 当前用户； b: 候选
  const ap = a.prefer || {};
  const bp = b.prefer || {};

  let total = 0;
  let weight = 0;
  const reasons = [];

  // 身高
  {
    const w = 0.15;
    const s = (inRange(b.height, ap.heightMin, ap.heightMax) +
               inRange(a.height, bp.heightMin, bp.heightMax)) / 2;
    total += s * w;
    weight += w;
    if (s >= 0.8) reasons.push(`身高匹配 (${b.height}cm)`);
  }
  // 体重
  {
    const w = 0.10;
    const s = (inRange(b.weight, ap.weightMin, ap.weightMax) +
               inRange(a.weight, bp.weightMin, bp.weightMax)) / 2;
    total += s * w;
    weight += w;
    if (s >= 0.8) reasons.push(`体重匹配 (${b.weight}kg)`);
  }
  // MBTI
  {
    const w = 0.20;
    const s = mbtiCompat(a.mbti, b.mbti);
    total += s * w;
    weight += w;
    if (s >= 0.7) reasons.push(`MBTI 相合 (${b.mbti})`);
  }
  // 星座
  {
    const w = 0.10;
    const s = zodiacCompat(a.zodiac, b.zodiac);
    total += s * w;
    weight += w;
    if (s >= 0.7) reasons.push(`星座相合 (${b.zodiac})`);
  }
  // 爱好
  {
    const w = 0.25;
    const s = hobbyScore(a.hobbies, b.hobbies);
    total += s * w;
    weight += w;
    if (s >= 0.5) {
      const overlap = (a.hobbies || []).filter((h) => (b.hobbies || []).includes(h));
      if (overlap.length) reasons.push(`共同爱好 ×${overlap.length} (${overlap.slice(0, 3).join('/')})`);
    }
  }
  // 角色（仅 gay 男平台，权重比原来性别项更高）
  {
    const w = 0.20;
    const s = roleCompat(a.role, b.role);
    total += s * w;
    weight += w;
    if (s >= 0.9) reasons.push(`角色匹配 (${a.role} ↔ ${b.role})`);
  }

  return {
    score: Math.round((total / weight) * 100),
    reasons,
  };
}

function rank(currentUser, candidates) {
  return candidates
    .filter((c) => c.id !== currentUser.id)
    .map((c) => ({ user: c, ...score(currentUser, c) }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { score, rank };
