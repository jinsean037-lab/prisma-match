// public/js/app.js —— 路由 + 全局状态
(function () {
  const { $, el } = UI;
  const routes = {};

  function route(name, handler) { routes[name] = handler; }

  async function resolve() {
    UI.loading(true);
    const hash = location.hash.replace(/^#/, '') || '/';
    const path = hash.split('?')[0];
    const [name, ...rest] = path.split('/').filter(Boolean);
    const handler = routes[name || 'home'] || routes['*'] || notFound;

    // 公共：检查登录
    if (name !== 'auth' && name !== 'home' && !Prisma.state.token) {
      location.hash = '#/auth';
      UI.loading(false);
      return;
    }

    // 拉一次 me
    if (Prisma.state.token && !Prisma.state.user) {
      try {
        const { user } = await Prisma.api.me();
        Prisma.state.user = user;
        Prisma.connectSocket();
      } catch (e) {
        Prisma.setToken(null);
        if (name !== 'auth' && name !== 'home') location.hash = '#/auth';
        UI.loading(false);
        return;
      }
    }

    // 是否需要引导设置资料
    if (Prisma.state.user && !Prisma.state.user.profileComplete && name !== 'profile' && name !== 'auth') {
      toast('请先完善资料', 'warn');
      location.hash = '#/profile';
      UI.loading(false);
      return;
    }

    try {
      await handler(rest, new URLSearchParams(location.hash.split('?')[1] || ''));
    } catch (e) {
      console.error(e);
      toast(e.message || '出错了', 'error');
    }
    UI.loading(false);
    updateNav(name);
  }

  function updateNav(name) {
    const tb = $('#topbar');
    if (Prisma.state.token && Prisma.state.user && Prisma.state.user.profileComplete) {
      tb.classList.remove('hidden');
      $$('[data-nav]').forEach((a) => a.classList.toggle('text-mint-600', a.dataset.nav === name));
    } else {
      tb.classList.add('hidden');
    }
  }

  function notFound() {
    $('#app').innerHTML = '<div class="text-center py-20 text-ink-500">页面不存在</div>';
  }

  function homeView() {
    if (Prisma.state.token && Prisma.state.user) {
      if (!Prisma.state.user.profileComplete) location.hash = '#/profile';
      else location.hash = '#/match';
      return;
    }
    $('#app').innerHTML = `
      <section class="grid md:grid-cols-2 gap-8 items-center py-10">
        <div>
          <h1 class="text-4xl md:text-5xl font-bold leading-tight">
            <span class="bg-clip-text text-transparent bg-gradient-to-r from-mint-500 via-teal-400 to-peach-300">真诚相遇</span><br/>
            从一份清爽的自我介绍开始
          </h1>
          <p class="text-ink-500 mt-4 text-lg">Prisma 是一款面向 LGBTQ+ 群体的清新交友平台。基于身高体重、MBTI、星座、爱好等真实属性做加权匹配；先打招呼，对方同意后再深入聊。</p>
          <div class="mt-6 flex gap-3">
            <a href="#/auth?mode=register" class="btn btn-primary">开始使用</a>
            <a href="#/auth?mode=login" class="btn btn-ghost">已有账号</a>
          </div>
          <ul class="mt-8 space-y-2 text-sm text-ink-500">
            <li>· 基于 0 / 1 / 0.5 / side 角色智能匹配</li>
            <li>· 3 条消息门控，未经确认不能"长聊"骚扰</li>
            <li>· 内置敏感词过滤（含谐音 / 数字 / 符号变体）</li>
          </ul>
        </div>
        <div class="card p-6">
          <div class="flex items-center gap-3 mb-4">
            <img class="avatar-md" src="https://api.dicebear.com/7.x/avataaars/svg?seed=demo1" />
            <div>
              <div class="font-semibold">小柚</div>
              <div class="text-xs text-ink-500">178cm · 0 · INFP · 双子座</div>
            </div>
            <span class="ml-auto chip chip-pink">匹配度 92</span>
          </div>
          <p class="text-sm text-ink-700">喜欢徒步和胶片摄影，周末会去山里走走～想找同样喜欢户外、说话不急不躁的人 :)</p>
          <div class="mt-3 flex flex-wrap gap-1.5">
            <span class="chip">徒步</span><span class="chip">摄影</span><span class="chip">电影</span><span class="chip">咖啡</span>
          </div>
        </div>
      </section>
    `;
    $('#footer').classList.remove('hidden');
  }

  // 全局：登出
  document.getElementById('logout-btn').addEventListener('click', async () => {
    try { await Prisma.api.logout(); } catch (e) {}
    Prisma.setToken(null);
    Prisma.state.user = null;
    if (Prisma.state.socket) Prisma.state.socket.disconnect();
    location.hash = '#/';
    toast('已退出登录', 'ok');
  });

  window.App = { route, homeView, resolve };
  window.addEventListener('hashchange', resolve);
  document.addEventListener('DOMContentLoaded', () => {
    // 注册路由
    App.route('home', homeView);
    App.route('auth', ViewsAuth.render);
    App.route('profile', ViewsProfile.render);
    App.route('match', ViewsMatch.render);
    App.route('chat', ViewsChat.render);
    resolve();
  });
})();
