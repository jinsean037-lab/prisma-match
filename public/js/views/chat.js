// public/js/views/chat.js —— 消息列表 + 聊天详情（含门控 UI）
(function () {
  const ViewsChat = {};
  let currentConv = null;
  let pollingHandle = null;

  ViewsChat.render = async function (_seg, params) {
    if (!Prisma.state.user) { location.hash = '#/auth'; return; }
    const focusId = params.get('c');
    const app = document.getElementById('app');
    app.innerHTML = `
      <section class="grid lg:grid-cols-3 gap-4">
        <aside class="lg:col-span-1">
          <div class="card p-3">
            <div class="flex items-center justify-between mb-2">
              <h3 class="font-semibold">消息</h3>
              <span class="text-xs text-ink-500" id="conv-count">0</span>
            </div>
            <div id="conv-list" class="space-y-1 max-h-[70vh] overflow-y-auto"></div>
          </div>
        </aside>
        <div class="lg:col-span-2">
          <div id="chat-pane" class="card p-4 min-h-[70vh] flex flex-col">
            <div class="flex-1 grid place-items-center text-ink-500">从左侧选一个会话开始聊天</div>
          </div>
        </div>
      </section>
    `;

    // 监听实时事件
    Prisma.on('chat:message', onNewMessage);
    Prisma.on('chat:status', onStatusUpdate);

    await loadConversations(focusId);
  };

  async function loadConversations(focusId) {
    const list = document.getElementById('conv-list');
    list.innerHTML = '<div class="text-ink-500 text-sm py-6 text-center">加载中…</div>';
    try {
      const { conversations } = await Prisma.api.conversations();
      document.getElementById('conv-count').textContent = conversations.length;
      if (!conversations.length) {
        list.innerHTML = '<div class="text-ink-500 text-sm py-6 text-center">还没有会话，去匹配页发个招呼吧</div>';
      } else {
        list.innerHTML = '';
        conversations.forEach((c) => list.appendChild(convItem(c)));
      }
      // 自动聚焦
      if (focusId) {
        const c = conversations.find((x) => x.id === focusId);
        if (c) openConversation(c);
      } else if (conversations[0]) {
        openConversation(conversations[0]);
      }
    } catch (e) {
      list.innerHTML = `<div class="text-red-500 text-sm py-6 text-center">${UI.escapeHtml(e.message)}</div>`;
    }
  }

  function convItem(c) {
    const e = UI.el('div', { class: 'p-2 rounded-lg cursor-pointer hover:bg-mint-50 flex items-center gap-2' });
    e.innerHTML = `
      <img class="avatar-sm" src="${UI.escapeHtml(c.other?.avatar || '')}" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1">
          <div class="font-medium text-sm truncate">${UI.escapeHtml(c.other?.nickname || '?')}</div>
          ${c.confirmed ? '<span class="chip chip-mint text-[10px] py-0 px-1.5">已确认</span>' : (c.blocked ? '<span class="chip text-[10px] py-0 px-1.5" style="background:#fee2e2;color:#b91c1c">已屏蔽</span>' : '<span class="chip text-[10px] py-0 px-1.5">待确认</span>')}
        </div>
        <div class="text-xs text-ink-500 truncate">${c.lastActiveAt ? UI.fmtTime(c.lastActiveAt) : ''}</div>
      </div>
    `;
    e.addEventListener('click', () => openConversation(c));
    return e;
  }

  async function openConversation(conv) {
    currentConv = conv;
    renderChat(conv);
    // 拉历史
    try {
      const r = await Prisma.api.messages(conv.id);
      currentConv = r.conversation;
      renderChat(currentConv, r.messages);
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  }

  function renderChat(conv, msgs) {
    const pane = document.getElementById('chat-pane');
    const me = Prisma.state.user;
    const other = conv.other || {};
    const isInitiator = conv.isInitiator;
    const sentByMe = conv.sentByMe || 0;
    const limit = conv.freeLimit || 3;
    const remaining = isInitiator ? Math.max(0, limit - sentByMe) : null;

    pane.innerHTML = `
      <div class="flex items-center gap-2 pb-3 border-b border-mint-100">
        <img class="avatar-sm" src="${UI.escapeHtml(other.avatar || '')}" />
          <div>
            <div class="font-semibold">${UI.escapeHtml(other.nickname || '?')}</div>
            <div class="text-xs text-ink-500">${other.role ? UI.escapeHtml(other.role) + ' · ' : ''}${UI.escapeHtml(other.mbti || '')} ${UI.escapeHtml(other.zodiac || '')}</div>
          </div>
        <div class="ml-auto flex gap-1">
          ${!conv.confirmed && !conv.blocked ? `
            <button class="btn btn-soft text-xs" data-act="accept">同意深入聊</button>
            <button class="btn btn-danger text-xs" data-act="reject">拒绝</button>
          ` : ''}
          ${conv.confirmed ? '<span class="chip chip-mint">已互相确认</span>' : ''}
          ${conv.blocked ? '<span class="chip" style="background:#fee2e2;color:#b91c1c">已屏蔽</span>' : ''}
        </div>
      </div>

      ${!conv.confirmed && !conv.blocked ? `
        <div class="gate-banner ${remaining === 0 ? '' : 'ok'} mt-3">
          <div>
            ${isInitiator
              ? (remaining > 0
                  ? `对方尚未确认，你还能发 <b>${remaining}</b> 条消息（共 ${limit} 条）`
                  : `已达 ${limit} 条上限，需等待对方确认才能继续`)
              : `对方给你发了招呼，<b>同意</b>后双方可以深入聊天`}
          </div>
        </div>
      ` : ''}

      <div id="msg-list" class="flex-1 my-3 overflow-y-auto flex flex-col gap-2 min-h-[300px] max-h-[55vh]"></div>

      ${conv.blocked ? `
        <div class="text-center text-sm text-ink-500 py-3">会话已屏蔽，无法继续发送消息</div>
      ` : `
        <div class="flex gap-2">
          <textarea id="msg-input" class="textarea flex-1" maxlength="1000" placeholder="${conv.confirmed ? '说点什么…' : isInitiator ? '最多 ' + limit + ' 条（已发 ' + sentByMe + '）' : '对方未确认前你不能发消息'}"></textarea>
          <button class="btn btn-primary self-end" id="msg-send">发送</button>
        </div>
        <div class="text-xs text-ink-500 mt-1" id="send-tip"></div>
      `}
    `;

    // 渲染消息
    if (msgs) {
      const list = pane.querySelector('#msg-list');
      list.innerHTML = '';
      if (msgs.length === 0) {
        list.innerHTML = '<div class="text-ink-500 text-sm text-center py-6">还没有消息，发个招呼吧</div>';
      } else {
        msgs.forEach((m) => list.appendChild(msgBubble(m, me.id)));
        list.scrollTop = list.scrollHeight;
      }
    }

    // 绑定事件
    const sendBtn = pane.querySelector('#msg-send');
    if (sendBtn) {
      const input = pane.querySelector('#msg-input');
      const tip = pane.querySelector('#send-tip');
      const updateTip = () => {
        const v = input.value;
        const n = v.length;
        if (n === 0) { tip.textContent = ''; return; }
        tip.innerHTML = `已输入 <b>${n}</b> / 1000 字 ${isInitiator && !conv.confirmed ? '· 本次会话还剩 <b>' + (limit - sentByMe) + '</b> 条' : ''}`;
      };
      input.addEventListener('input', updateTip);

      const doSend = async () => {
        const text = input.value.trim();
        if (!text) return;
        if (!conv.confirmed && !isInitiator) {
          UI.toast('对方还未确认，你暂时不能发消息', 'warn');
          return;
        }
        if (!conv.confirmed && isInitiator && sentByMe >= limit) {
          UI.toast('已达未确认前的 ' + limit + ' 条上限', 'error');
          return;
        }
        UI.loading(true);
        try {
          // 优先用 socket 实时推
          if (Prisma.state.socket && Prisma.state.socket.connected) {
            await Prisma.socketEmit('chat:send', { convId: conv.id, text });
          } else {
            await Prisma.api.sendMessage(conv.id, text);
          }
          input.value = '';
          updateTip();
          // 主动拉一次最新
          const r = await Prisma.api.messages(conv.id);
          renderChat(r.conversation, r.messages);
        } catch (e) {
          UI.toast(e.message, 'error');
          if (e.data && e.data.detail) {
            tip.innerHTML = `<span class="text-red-500">已拦截：${(e.data.detail.matches||[]).map(m=>UI.escapeHtml(m.word)).join('、')}</span>`;
          } else if (e.limit != null) {
            tip.innerHTML = `<span class="text-red-500">已达 ${e.limit} 条上限</span>`;
          }
        }
        UI.loading(false);
      };
      sendBtn.addEventListener('click', doSend);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          doSend();
        }
      });
    }

    pane.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', async () => {
        const act = b.dataset.act;
        if (act === 'accept') {
          UI.loading(true);
          try {
            await Prisma.api.confirmChat(conv.id, true);
            UI.toast('已同意', 'ok');
            const r = await Prisma.api.messages(conv.id);
            renderChat(r.conversation, r.messages);
          } catch (e) { UI.toast(e.message, 'error'); }
          UI.loading(false);
        } else if (act === 'reject') {
          if (!confirm('拒绝后该会话将被屏蔽，确定吗？')) return;
          UI.loading(true);
          try {
            await Prisma.api.confirmChat(conv.id, false);
            UI.toast('已拒绝', 'warn');
            const r = await Prisma.api.messages(conv.id);
            renderChat(r.conversation, r.messages);
          } catch (e) { UI.toast(e.message, 'error'); }
          UI.loading(false);
        }
      });
    });
  }

  function msgBubble(m, myId) {
    const e = UI.el('div', { class: 'flex flex-col' });
    const isMine = m.from === myId;
    e.innerHTML = `
      <div class="bubble ${isMine ? 'mine' : 'theirs'}">${UI.escapeHtml(m.text)}</div>
      <div class="text-[10px] text-ink-500 mt-0.5 ${isMine ? 'self-end mr-2' : 'self-start ml-2'}">${UI.fmtTime(m.ts)}</div>
    `;
    return e;
  }

  function onNewMessage(p) {
    if (!currentConv || p.message.convId !== currentConv.id) {
      // 不是当前会话，刷新列表
      loadConversations();
      return;
    }
    // 当前会话：插一条
    const list = document.getElementById('msg-list');
    if (!list) return;
    // 去重
    if (list.querySelector(`[data-mid="${p.message.id}"]`)) return;
    const node = msgBubble(p.message, Prisma.state.user.id);
    node.dataset.mid = p.message.id;
    list.appendChild(node);
    list.scrollTop = list.scrollHeight;
    // 更新元数据
    if (p.conversation) {
      currentConv = { ...currentConv, ...p.conversation };
      renderChat(currentConv); // 重渲染门控状态
    }
  }
  function onStatusUpdate(conv) {
    if (currentConv && conv.id === currentConv.id) {
      currentConv = { ...currentConv, ...conv };
      renderChat(currentConv);
    }
    loadConversations();
  }

  window.ViewsChat = ViewsChat;
})();
