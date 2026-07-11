// scripts/seed.js —— 灌入 6 个示例用户 + 一些搭讪/消息（方便看效果）
// 用法：node scripts/seed.js
// 注意：会清空 data/users.json / data/conversations.json / data/messages.json

const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const DATA = path.join(__dirname, '..', 'data');
const usersPath = path.join(DATA, 'users.json');
const convPath = path.join(DATA, 'conversations.json');
const msgPath = path.join(DATA, 'messages.json');

// 清空
fs.writeFileSync(usersPath, '{}', 'utf8');
fs.writeFileSync(convPath, '[]', 'utf8');
fs.writeFileSync(msgPath, '[]', 'utf8');

function makeUser(opts) {
  const id = crypto.randomBytes(8).toString('hex');
  const hash = bcrypt.hashSync('demo1234', 8);
  return {
    id,
    username: opts.username,
    passwordHash: hash,
    nickname: opts.nickname,
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(opts.username)}`,
    gender: opts.gender,
    orientation: opts.orientation,
    height: opts.height,
    weight: opts.weight,
    mbti: opts.mbti,
    zodiac: opts.zodiac,
    hobbies: opts.hobbies,
    bio: opts.bio,
    profileComplete: true,
    prefer: opts.prefer,
    createdAt: Date.now(),
  };
}

const USERS = [
  // —— 0（接受方） ——
  makeUser({
    username: 'xiaoYou', nickname: '小柚',
    gender: 'male', orientation: 'gay',
    role: '0',
    height: 178, weight: 65, mbti: 'INFP', zodiac: '双子',
    bio: '喜欢徒步和胶片摄影，周末会去山里走走～',
    hobbies: ['徒步', '摄影', '电影', '咖啡'],
    prefer: { rolePref: ['1', '0.5'], heightMin: 165, heightMax: 195, weightMin: 50, weightMax: 90, mbtiPref: ['INFP', 'ENFP', 'INFJ'], zodiacPref: ['双子', '天秤', '水瓶'], hobbyPref: ['徒步', '摄影', '咖啡'] },
  }),
  // —— 1（主动方） ——
  makeUser({
    username: 'muSen', nickname: '木森',
    gender: 'male', orientation: 'gay',
    role: '1',
    height: 182, weight: 70, mbti: 'ENFP', zodiac: '天秤',
    bio: '摄影 / 咖啡 / 露营。最近在自学黑白胶片冲洗。',
    hobbies: ['摄影', '咖啡', '露营', '电影'],
    prefer: { rolePref: ['0', '0.5'], heightMin: 170, heightMax: 200, weightMin: 55, weightMax: 95, mbtiPref: ['INFP', 'ENFP'], zodiacPref: ['双子', '天秤'], hobbyPref: ['摄影', '徒步', '露营'] },
  }),
  // —— 0.5（均可） ——
  makeUser({
    username: 'baiYe', nickname: '白夜',
    gender: 'male', orientation: 'gay',
    role: '0.5',
    height: 174, weight: 60, mbti: 'INFJ', zodiac: '天蝎',
    bio: '安静，喜欢读书和深夜散步，听后摇。',
    hobbies: ['读书', '徒步', '电影', '音乐'],
    prefer: { rolePref: ['0', '1', '0.5'], heightMin: 160, heightMax: 190, weightMin: 45, weightMax: 85, mbtiPref: ['INFJ', 'INFP'], zodiacPref: ['天蝎', '双鱼'], hobbyPref: ['读书', '电影'] },
  }),
  // —— side ——
  makeUser({
    username: 'yuXin', nickname: '雨欣',
    gender: 'male', orientation: 'gay',
    role: 'side',
    height: 168, weight: 55, mbti: 'ENFJ', zodiac: '巨蟹',
    bio: '心理学在读，喜欢花艺和手冲咖啡，养了一只橘猫。',
    hobbies: ['咖啡', '花艺', '宠物', '读书'],
    prefer: { rolePref: ['side'], heightMin: 158, heightMax: 185, weightMin: 45, weightMax: 80, mbtiPref: ['ENFJ', 'INFP'], zodiacPref: ['巨蟹', '双鱼', '天蝎'], hobbyPref: ['咖啡', '宠物', '花艺'] },
  }),
  // —— 0 ——
  makeUser({
    username: 'anQi', nickname: '安琪',
    gender: 'male', orientation: 'gay',
    role: '0',
    height: 172, weight: 58, mbti: 'ISFP', zodiac: '双鱼',
    bio: '插画师 + 业余舞者，周末去 live house。',
    hobbies: ['绘画', '舞蹈', '音乐', '咖啡'],
    prefer: { rolePref: ['1', '0.5'], heightMin: 160, heightMax: 185, weightMin: 50, weightMax: 80, mbtiPref: ['ISFP', 'INFP', 'ENFP'], zodiacPref: ['双鱼', '天秤'], hobbyPref: ['绘画', '舞蹈', '音乐'] },
  }),
  // —— 1 ——
  makeUser({
    username: 'shuYu', nickname: '舒雨',
    gender: 'male', orientation: 'gay',
    role: '1',
    height: 175, weight: 63, mbti: 'ENTP', zodiac: '水瓶',
    bio: '互联网产品经理 / 业余调酒师，聊啥都行 :)',
    hobbies: ['音乐', '游戏', '咖啡', '旅行'],
    prefer: { rolePref: ['0', '0.5'], heightMin: 160, heightMax: 188, weightMin: 45, weightMax: 85, mbtiPref: [], zodiacPref: [], hobbyPref: ['音乐', '游戏', '旅行'] },
  }),
];

const usersObj = {};
USERS.forEach((u) => { usersObj[u.id] = u; });
fs.writeFileSync(usersPath, JSON.stringify(usersObj, null, 2), 'utf8');
console.log(`✓ 已写入 ${USERS.length} 个用户到 ${usersPath}`);

// 构造一些初始会话和消息
const convs = [];
const msgs = [];
const now = Date.now();

function addConv(fromUser, toUser, opts) {
  const conv = {
    id: crypto.randomBytes(6).toString('hex'),
    from: fromUser.id,
    to: toUser.id,
    confirmed: !!opts.confirmed,
    confirmedBy: opts.confirmed ? toUser.id : null,
    confirmedAt: opts.confirmed ? now - 3600_000 : null,
    blocked: false,
    createdAt: now - 86400_000,
    lastActiveAt: now,
  };
  convs.push(conv);
  return conv;
}
function addMsg(conv, from, to, text, offsetMs) {
  const m = {
    id: crypto.randomBytes(6).toString('hex'),
    convId: conv.id,
    from: from.id, to: to.id,
    text,
    ts: now - (offsetMs || 0),
  };
  msgs.push(m);
  return m;
}

const [xiaoYou, muSen, baiYe, yuXin, anQi, shuYu] = USERS;

// 1) 小柚 ↔ 木森（已确认，深入聊过几条）
{
  const c = addConv(xiaoYou, muSen, { confirmed: true });
  addMsg(c, xiaoYou, muSen, '看了你的资料！胶片冲扫是自己做吗？', 7200_000);
  addMsg(c, muSen, xiaoYou, '对，自己冲。最近在试 HC-110，灰阶好看 :)', 7100_000);
  addMsg(c, xiaoYou, muSen, '厉害！周末要不要一起去山里拍？', 7000_000);
  addMsg(c, muSen, xiaoYou, '可以！', 6900_000);
}
// 2) 小柚 → 白夜（未确认，1 条招呼）
{
  const c = addConv(xiaoYou, baiYe, { confirmed: false });
  addMsg(c, xiaoYou, baiYe, '你好呀，看到你也喜欢徒步和电影 :)', 60_000);
}
// 3) 雨欣 → 安琪（已确认）
{
  const c = addConv(yuXin, anQi, { confirmed: true });
  addMsg(c, yuXin, anQi, '你的插画好喜欢！是手绘还是板绘？', 3600_000);
  addMsg(c, anQi, yuXin, '板绘为主～偶尔水彩', 3500_000);
  addMsg(c, yuXin, anQi, '想看更多！', 3400_000);
}

fs.writeFileSync(convPath, JSON.stringify(convs, null, 2), 'utf8');
fs.writeFileSync(msgPath, JSON.stringify(msgs, null, 2), 'utf8');
console.log(`✓ 已写入 ${convs.length} 个会话, ${msgs.length} 条消息`);
console.log('\n默认登录账号（密码统一：demo1234）：');
USERS.forEach((u) => console.log(`  - ${u.username}  (${u.nickname})`));
console.log('\n直接 node server.js 启动即可～');
