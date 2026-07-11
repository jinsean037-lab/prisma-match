// scripts/e2e.js —— 端到端冒烟测试
// 用法：node scripts/e2e.js
// 覆盖：注册 → 资料 → 匹配 → 搭讪 → 门控（3 条） → 确认 → 自由聊天 → 敏感词拦截

const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
function ok(label) { pass++; console.log(`  ✓ ${label}`); }
function bad(label, detail) { fail++; console.log(`  ✗ ${label}\n    ${detail}`); }

async function call(method, path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch (e) {}
  if (!res.ok) {
    const err = new Error(json?.error || `HTTP ${res.status}`);
    err.status = res.status; err.data = json;
    throw err;
  }
  return json;
}

async function expectThrow(label, fn, expectMessageRegex) {
  try {
    await fn();
    bad(label, 'expected throw, got success');
  } catch (e) {
    if (expectMessageRegex && !expectMessageRegex.test(e.message)) {
      bad(label, `wrong message: ${e.message}`);
    } else {
      ok(`${label} (rejected: ${e.message})`);
    }
  }
}

(async () => {
  console.log('=== 1) 注册 alice / bob ===');
  const ts = Date.now();
  const alice = await call('POST', '/api/auth/register', {
    username: 'alice_' + ts, password: 'pw1234a', nickname: '小柚',
    role: '0',
  });
  ok('alice registered');
  const bob = await call('POST', '/api/auth/register', {
    username: 'bob_' + ts, password: 'pw1234a', nickname: '小森',
    role: '1',
  });
  ok('bob registered');

  console.log('\n=== 2) 双方完善资料 ===');
  await call('PUT', '/api/profile/me', {
    role: '0', height: 178, weight: 65, mbti: 'INFP', zodiac: '双子',
    bio: '喜欢徒步和摄影',
    hobbies: ['徒步','摄影','电影','咖啡'],
    prefer: {
      rolePref: ['1', '0.5'], heightMin: 160, heightMax: 195, weightMin: 45, weightMax: 90,
      mbtiPref: ['INFP','ENFP'], zodiacPref: ['双子','天秤','水瓶'], hobbyPref: ['徒步','摄影'],
    },
  }, alice.token);
  ok('alice profile saved');

  await call('PUT', '/api/profile/me', {
    role: '1', height: 182, weight: 70, mbti: 'ENFP', zodiac: '天秤',
    bio: '摄影 / 咖啡 / 露营',
    hobbies: ['摄影','咖啡','露营','电影'],
    prefer: {
      rolePref: ['0', '0.5'], heightMin: 170, heightMax: 195, weightMin: 55, weightMax: 95,
      mbtiPref: ['INFP','ENFP'], zodiacPref: ['双子','天秤'], hobbyPref: ['徒步','摄影','咖啡'],
    },
  }, bob.token);
  ok('bob profile saved');

  console.log('\n=== 3) 匹配候选 ===');
  const { candidates } = await call('GET', '/api/match/candidates', null, alice.token);
  if (candidates.length >= 1 && candidates[0].id === bob.user.id) {
    ok(`alice sees bob first (score=${candidates[0].score})`);
  } else {
    bad('alice should see bob first', JSON.stringify(candidates.slice(0, 2)));
  }

  console.log('\n=== 4) 搭讪：alice → bob ===');
  const start = await call('POST', '/api/chat/start', {
    toUserId: bob.user.id, firstMessage: '看了你的资料，想认识一下 :)',
  }, alice.token);
  ok(`conversation created (id=${start.conversation.id})`);
  const convId = start.conversation.id;

  console.log('\n=== 5) 门控：alice 在未确认前可发 3 条，第 4 条被拒 ===');
  await call('POST', `/api/chat/conversations/${convId}/messages`, { text: '第一条' }, alice.token);
  ok('msg #1 sent');
  await call('POST', `/api/chat/conversations/${convId}/messages`, { text: '第二条' }, alice.token);
  ok('msg #2 sent');
  await call('POST', `/api/chat/conversations/${convId}/messages`, { text: '第三条' }, alice.token);
  ok('msg #3 sent');
  await expectThrow(
    'msg #4 rejected (3-limit)',
    () => call('POST', `/api/chat/conversations/${convId}/messages`, { text: '第四条' }, alice.token),
    /最多.*3.*条|limit/i,
  );

  console.log('\n=== 6) bob 接收方在未确认前不能发 ===');
  await expectThrow(
    'bob (non-initiator) cannot send before confirm',
    () => call('POST', `/api/chat/conversations/${convId}/messages`, { text: '我先说' }, bob.token),
    /确认|未确认/,
  );

  console.log('\n=== 7) 敏感词拦截 ===');
  await expectThrow(
    'plain bad word blocked',
    () => call('POST', `/api/chat/conversations/${convId}/messages`, { text: '约pao不' }, alice.token),
    /违规|敏感/,
  );
  await expectThrow(
    'mixed Chinese + Latin pinyin blocked',
    () => call('POST', `/api/chat/conversations/${convId}/messages`, { text: '我 们 去 开 fang 吧' }, alice.token),
    /违规|敏感/,
  );
  await expectThrow(
    'l33t English blocked',
    () => call('POST', `/api/chat/conversations/${convId}/messages`, { text: 'f*ck off' }, alice.token),
    /违规|敏感/,
  );

  console.log('\n=== 8) bob 确认，alice 可继续发 ===');
  await call('POST', `/api/chat/conversations/${convId}/confirm`, { accept: true }, bob.token);
  ok('bob accepted');
  await call('POST', `/api/chat/conversations/${convId}/messages`, { text: '第四条：谢谢接受！' }, alice.token);
  ok('msg #4 sent after confirm');
  await call('POST', `/api/chat/conversations/${convId}/messages`, { text: '可以聊聊摄影吗' }, bob.token);
  ok('bob can also send after confirm');

  console.log('\n=== 9) 历史消息 ===');
  const hist = await call('GET', `/api/chat/conversations/${convId}/messages`, null, alice.token);
  if (hist.messages.length === 5) {
    ok(`history has 5 messages`);
  } else {
    bad('expected 5 messages', `got ${hist.messages.length}`);
  }

  console.log(`\n=== 总结：${pass} passed, ${fail} failed ===`);
  process.exit(fail > 0 ? 1 : 0);
})();
