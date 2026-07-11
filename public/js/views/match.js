// public/js/views/match.js —— 匹配浏览 + 发起搭讪
(function () {
  const ViewsMatch = {};

  ViewsMatch.render = async function () {
    if (!Prisma.state.user) { location.hash = '#/auth'; return; }
    const app = document.getElementById('app');
    app.innerHTML = `
      <section>
        <div class="flex items-center justify-between mb-4">
          <div>
            <h2 class="text-xl font-semibold">为你匹配</h2>
            <p class="text-sm text-ink-500 mt-0.5">按你的偏好（身高体重 / MBTI / 星座 / 爱好）打分排序</p>
          </div>
          <a href="#/chat" class="btn btn-ghost text-sm">查看消息 →</a>
        </div>
        <div id="candidates" class="grid sm:grid-cols-2 lg:grid-cols-3 gap-4"></div>
      </section>
    `;
    const list = document.getElementById('candidates');
    list.innerHTML = '<div class="col-span-full text-center text-ink-500 py-10">加载中…</div>';
    try {
      const { candidates } = await Prisma.api.candidates();
      if (!candidates.length) {
        list.innerHTML = '<div class="col-span-full text-center text-ink-500 py-10">还没有其他用户，去邀请朋友来玩吧</div>';
        return;
      }
      list.innerHTML = '';
      candidates.forEach((c) => list.appendChild(card(c)));
    } catch (e) {
      list.innerHTML = `<div class="col-span-full text-center text-error-500 py-10">${UI.escapeHtml(e.message)}</div>`;
    }
  };

  function card(c) {
    const card = UI.el('div', { class: 'card p-4 relative cursor-pointer' });
    const roleLabel = c.role ? ({ '0': '0', '1': '1', '0.5': '0.5', 'side': 'side' }[c.role] || c.role) : '?';
    card.innerHTML = `
      <div class="score-badge">${c.score} 分</div>
      <div class="flex items-center gap-3">
        <img class="avatar-md" src="${UI.escapeHtml(c.avatar)}" />
        <div class="min-w-0">
          <div class="font-semibold truncate">${UI.escapeHtml(c.nickname)}</div>
          <div class="text-xs text-ink-500 truncate">${(c.height || '?')+'cm · '+(c.weight || '?')+'kg'+(c.mbti?' · '+c.mbti:'')}${c.zodiac?' · '+c.zodiac:''}</div>
        </div>
        ${c.role ? `<span class="chip chip-pink ml-auto">${UI.escapeHtml(roleLabel)}</span>` : ''}
      </div>
      ${c.bio ? `<p class="text-sm text-ink-700 mt-3 line-clamp-2">${UI.escapeHtml(c.bio)}</p>` : ''}
      ${(c.hobbies||[]).length ? `<div class="mt-3 flex flex-wrap gap-1">${(c.hobbies||[]).slice(0,5).map((h)=>`<span class="chip">${UI.escapeHtml(h)}</span>`).join('')}</div>` : ''}
      ${(c.reasons||[]).length ? `<div class="mt-3 text-xs text-ink-500">${c.reasons.map((r)=>'· '+UI.escapeHtml(r)).join('  ')}</div>` : ''}
      <div class="mt-4 flex gap-2">
        <button class="btn btn-primary flex-1 justify-center" data-act="hello">打个招呼</button>
      </div>
    `;
    card.querySelector('[data-act="hello"]').addEventListener('click', (e) => {
      e.stopPropagation();
      openHello(c);
    });
    return card;
  }

  function openHello(c) {
    const overlay = UI.el('div', { class: 'fixed inset-0 z-50 bg-black/30 grid place-items-center p-4' });
    overlay.innerHTML = `
      <div class="card p-5 w-full max-w-md">
        <div class="flex items-center gap-3">
          <img class="avatar-md" src="${UI.escapeHtml(c.avatar)}" />
          <div>
            <div class="font-semibold">${UI.escapeHtml(c.nickname)}</div>
            <div class="text-xs text-ink-500">匹配度 ${c.score}</div>
          </div>
          <button class="ml-auto text-ink-500" data-act="close">✕</button>
        </div>
        <p class="text-sm text-ink-500 mt-3">向对方打个招呼吧！对方确认后可以深入聊天，未确认前你最多发 3 条消息。</p>
        <textarea id="hello-text" class="textarea mt-3" maxlength="200" placeholder="例如：看了你的资料，很喜欢你的胶片摄影，可以多聊聊吗？"></textarea>
        <div class="mt-3 text-xs text-ink-500" id="hello-tip"></div>
        <div class="mt-3 flex justify-end gap-2">
          <button class="btn btn-ghost" data-act="close">取消</button>
          <button class="btn btn-primary" data-act="send">发送</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
      if (e.target.matches('[data-act="close"]')) overlay.remove();
    });
    const tip = overlay.querySelector('#hello-tip');
    const ta = overlay.querySelector('#hello-text');
    ta.addEventListener('input', () => {
      const n = ta.value.length;
      tip.textContent = n === 0 ? '' : `已输入 ${n} 字（限 200）`;
    });
    overlay.querySelector('[data-act="send"]').addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) { UI.toast('说点什么吧', 'warn'); return; }
      UI.loading(true);
      try {
        const r = await Prisma.api.startChat(c.id, text);
        overlay.remove();
        UI.toast(r.isNew ? '招呼已发出，等待对方确认' : '会话已存在，跳转到聊天', 'ok');
        location.hash = `#/chat?c=${r.conversation.id}`;
      } catch (e) {
        UI.toast(e.message, 'error');
        if (e.data && e.data.detail) {
          tip.innerHTML = `<span class="text-red-500">已拦截：${(e.data.detail.matches||[]).map(m=>UI.escapeHtml(m.word)).join('、')}</span>`;
        }
      }
      UI.loading(false);
    });
  }

  window.ViewsMatch = ViewsMatch;
})();
