// public/js/api.js —— API 封装 + Socket 客户端
(function () {
  const TOKEN_KEY = 'prisma.token';

  const state = {
    token: localStorage.getItem(TOKEN_KEY) || null,
    user: null,
    socket: null,
    listeners: { 'chat:message': [], 'chat:status': [] },
  };

  function setToken(t) {
    state.token = t;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  }

  async function call(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = `Bearer ${state.token}`;
    const res = await fetch(path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function connectSocket() {
    if (!state.token) return;
    if (state.socket) state.socket.disconnect();
    state.socket = io({ auth: { token: state.token } });
    state.socket.on('connect_error', (e) => console.warn('[io]', e.message));
    state.socket.on('chat:message', (p) => state.listeners['chat:message'].forEach((fn) => fn(p)));
    state.socket.on('chat:status', (p) => state.listeners['chat:status'].forEach((fn) => fn(p)));
  }

  function on(evt, fn) {
    if (!state.listeners[evt]) state.listeners[evt] = [];
    state.listeners[evt].push(fn);
  }

  function off(evt, fn) {
    if (!state.listeners[evt]) return;
    state.listeners[evt] = state.listeners[evt].filter((f) => f !== fn);
  }

  function socketEmit(evt, payload) {
    return new Promise((resolve, reject) => {
      if (!state.socket) return reject(new Error('socket 未连接'));
      state.socket.emit(evt, payload, (ack) => {
        if (!ack) return resolve({ ok: true });
        if (ack.error) return reject(Object.assign(new Error(ack.error), ack));
        resolve(ack);
      });
    });
  }

  // 业务接口
  const api = {
    // auth
    register: (b) => call('POST', '/api/auth/register', b),
    login: (b) => call('POST', '/api/auth/login', b),
    logout: () => call('POST', '/api/auth/logout'),
    me: () => call('GET', '/api/auth/me'),

    // profile
    updateProfile: (b) => call('PUT', '/api/profile/me', b),
    profileOptions: () => call('GET', '/api/profile/options'),

    // match
    candidates: () => call('GET', '/api/match/candidates'),

    // chat
    startChat: (toUserId, firstMessage) => call('POST', '/api/chat/start', { toUserId, firstMessage }),
    conversations: () => call('GET', '/api/chat/conversations'),
    messages: (convId) => call('GET', `/api/chat/conversations/${convId}/messages`),
    sendMessage: (convId, text) => call('POST', `/api/chat/conversations/${convId}/messages`, { text }),
    confirmChat: (convId, accept) => call('POST', `/api/chat/conversations/${convId}/confirm`, { accept }),
    blockChat: (convId) => call('POST', `/api/chat/conversations/${convId}/block`),
  };

  window.Prisma = { state, setToken, api, connectSocket, socketEmit, on, off };
})();
