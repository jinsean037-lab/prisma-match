// scripts/seed.js —— 灌入示例用户
// 用法：MONGODB_URI=... node scripts/seed.js
// 也支持本地：node scripts/seed.js（默认连 mongodb://localhost:27017）

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { users, conversations, messages, ready$ } = require('../lib/store');

function makeUser(opts) {
  const id = crypto.randomBytes(8).toString('hex');
  return {
    id,
    username: opts.username,
    passwordHash: bcrypt.hashSync('demo1234', 8),
    nickname: opts.nickname,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(opts.username)}`,
    gender: 'male', orientation: 'gay', role: opts.role,
    height: opts.height, weight: opts.weight,
    mbti: opts.mbti, zodiac: opts.zodiac,
    hobbies: opts.hobbies, bio: opts.bio,
    profileComplete: true,
    prefer: opts.prefer,
    createdAt: Date.now(),
  };
}

const USERS = [
  makeUser({ username: 'xiaoYou', nickname: '小柚', role: '0', height: 178, weight: 65, mbti: 'INFP', zodiac: '双子',
    bio: '喜欢徒步和胶片摄影，周末会去山里走走～',
    hobbies: ['徒步', '摄影', '电影', '咖啡'],
    prefer: { rolePref: ['1', '0.5'], heightMin: 165, heightMax: 195, weightMin: 50, weightMax: 90, mbtiPref: ['INFP', 'ENFP', 'INFJ'], zodiacPref: ['双子', '天秤', '水瓶'], hobbyPref: ['徒步', '摄影', '咖啡'] } }),
  makeUser({ username: 'muSen', nickname: '木森', role: '1', height: 182, weight: 70, mbti: 'ENFP', zodiac: '天秤',
    bio: '摄影 / 咖啡 / 露营。最近在自学黑白胶片冲洗。',
    hobbies: ['摄影', '咖啡', '露营', '电影'],
    prefer: { rolePref: ['0', '0.5'], heightMin: 170, heightMax: 200, weightMin: 55, weightMax: 95, mbtiPref: ['INFP', 'ENFP'], zodiacPref: ['双子', '天秤'], hobbyPref: ['摄影', '徒步', '露营'] } }),
  makeUser({ username: 'baiYe', nickname: '白夜', role: '0.5', height: 174, weight: 60, mbti: 'INFJ', zodiac: '天蝎',
    bio: '安静，喜欢读书和深夜散步，听后摇。',
    hobbies: ['读书', '徒步', '电影', '音乐'],
    prefer: { rolePref: ['0', '1', '0.5'], heightMin: 160, heightMax: 190, weightMin: 45, weightMax: 85, mbtiPref: ['INFJ', 'INFP'], zodiacPref: ['天蝎', '双鱼'], hobbyPref: ['读书', '电影'] } }),
  makeUser({ username: 'yuXin', nickname: '雨欣', role: 'side', height: 168, weight: 55, mbti: 'ENFJ', zodiac: '巨蟹',
    bio: '心理学在读，喜欢花艺和手冲咖啡，养了一只橘猫。',
    hobbies: ['咖啡', '花艺', '宠物', '读书'],
    prefer: { rolePref: ['side'], heightMin: 158, heightMax: 185, weightMin: 45, weightMax: 80, mbtiPref: ['ENFJ', 'INFP'], zodiacPref: ['巨蟹', '双鱼', '天蝎'], hobbyPref: ['咖啡', '宠物', '花艺'] } }),
  makeUser({ username: 'anQi', nickname: '安琪', role: '0', height: 172, weight: 58, mbti: 'ISFP', zodiac: '双鱼',
    bio: '插画师 + 业余舞者，周末去 live house。',
    hobbies: ['绘画', '舞蹈', '音乐', '咖啡'],
    prefer: { rolePref: ['1', '0.5'], heightMin: 160, heightMax: 185, weightMin: 50, weightMax: 80, mbtiPref: ['ISFP', 'INFP', 'ENFP'], zodiacPref: ['双鱼', '天秤'], hobbyPref: ['绘画', '舞蹈', '音乐'] } }),
  makeUser({ username: 'shuYu', nickname: '舒雨', role: '1', height: 175, weight: 63, mbti: 'ENTP', zodiac: '水瓶',
    bio: '互联网产品经理 / 业余调酒师，聊啥都行 :)',
    hobbies: ['音乐', '游戏', '咖啡', '旅行'],
    prefer: { rolePref: ['0', '0.5'], heightMin: 160, heightMax: 188, weightMin: 45, weightMax: 85, mbtiPref: [], zodiacPref: [], hobbyPref: ['音乐', '游戏', '旅行'] } }),
];

(async () => {
  await ready$();
  for (const u of USERS) {
    await users.upsert(u);
  }
  console.log(`✓ 已写入 ${USERS.length} 个用户`);

  const [xiaoYou, muSen, baiYe, yuXin, anQi, shuYu] = USERS;
  const now = Date.now();
  function newConv(a, b, opts) {
    return {
      id: crypto.randomBytes(6).toString('hex'),
      from: a.id, to: b.id,
      confirmed: !!opts.confirmed,
      confirmedBy: opts.confirmed ? b.id : null,
      confirmedAt: opts.confirmed ? now - 3600_000 : null,
      blocked: false,
      createdAt: now - 86400_000,
      lastActiveAt: now,
    };
  }
  function newMsg(conv, from, to, text, offsetMs) {
    return {
      id: crypto.randomBytes(6).toString('hex'),
      convId: conv.id, from: from.id, to: to.id,
      text, ts: now - (offsetMs || 0),
    };
  }
  // 1) 小柚 ↔ 木森（已确认）
  let c = newConv(xiaoYou, muSen, { confirmed: true });
  await conversations.upsert(c);
  for (const [a, b, t, o] of [
    [xiaoYou, muSen, '看了你的资料！胶片冲扫是自己做吗？', 7200_000],
    [muSen, xiaoYou, '对，自己冲。最近在试 HC-110，灰阶好看 :)', 7100_000],
    [xiaoYou, muSen, '厉害！周末要不要一起去山里拍？', 7000_000],
    [muSen, xiaoYou, '可以！', 6900_000],
  ]) await messages.add(newMsg(c, a, b, t, o));

  // 2) 小柚 → 白夜（未确认）
  c = newConv(xiaoYou, baiYe, { confirmed: false });
  await conversations.upsert(c);
  await messages.add(newMsg(c, xiaoYou, baiYe, '你好呀，看到你也喜欢徒步和电影 :)', 60_000));

  // 3) 雨欣 → 安琪（已确认）
  c = newConv(yuXin, anQi, { confirmed: true });
  await conversations.upsert(c);
  for (const [a, b, t, o] of [
    [yuXin, anQi, '你的插画好喜欢！是手绘还是板绘？', 3600_000],
    [anQi, yuXin, '板绘为主～偶尔水彩', 3500_000],
    [yuXin, anQi, '想看更多！', 3400_000],
  ]) await messages.add(newMsg(c, a, b, t, o));

  console.log(`✓ 已写入 3 个会话 / 多条消息`);
  console.log('\n默认登录账号（密码统一：demo1234）：');
  USERS.forEach((u) => console.log(`  - ${u.username}  (${u.nickname} · ${u.role})`));
  console.log('\n打开 http://localhost:3000 即可登录');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
