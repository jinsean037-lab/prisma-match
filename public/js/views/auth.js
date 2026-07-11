// public/js/views/auth.js —— 登录 / 注册
(function () {
  const ViewsAuth = {};

  // 密码规则：8+ 位，必须同时含字母和数字
  const PW_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8,}$/;
  const PW_HINT = '8 位以上，须同时包含字母和数字';

  ViewsAuth.render = async function () {
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const mode = params.get('mode') || 'login';

    const app = document.getElementById('app');
    app.innerHTML = `
      <section class="max-w-md mx-auto py-6">
        <div class="card p-6">
          <div class="flex items-center gap-2 mb-2">
            <img src="/img/logo.svg" class="w-7 h-7" alt="" />
            <span class="font-semibold text-lg">Prisma</span>
          </div>
          <h2 class="text-xl font-semibold mt-2" id="auth-title">登录</h2>
          <p class="text-sm text-ink-500 mt-1" id="auth-sub">使用账号登录开始匹配</p>

          <form id="auth-form" class="mt-6 space-y-3" novalidate>
            <div>
              <label class="text-sm text-ink-700">用户名 <span class="text-ink-500">（2-20 位）</span></label>
              <input class="input mt-1" name="username" required minlength="2" maxlength="20" autocomplete="username" />
            </div>
            <div>
              <label class="text-sm text-ink-700">密码 <span class="text-ink-500">（${PW_HINT}）</span></label>
              <input class="input mt-1" name="password" type="password" required minlength="8" maxlength="40" autocomplete="new-password" />
              <div class="text-xs mt-1" id="pw-hint"></div>
            </div>

            <div id="extra-fields" class="space-y-3 ${mode === 'register' ? '' : 'hidden'}">
              <div>
                <label class="text-sm text-ink-700">昵称</label>
                <input class="input mt-1" name="nickname" maxlength="16" placeholder="想在平台上被怎样称呼" />
              </div>
              <div>
                <label class="text-sm text-ink-700">你的角色</label>
                <div class="mt-2 flex gap-2 flex-wrap">
                  <label class="tag" data-radio="role" data-value="0">0 · 接受方</label>
                  <label class="tag" data-radio="role" data-value="1">1 · 主动方</label>
                  <label class="tag" data-radio="role" data-value="0.5">0.5 · 都可以</label>
                  <label class="tag" data-radio="role" data-value="side">side · 不参与</label>
                </div>
                <p class="text-xs text-ink-500 mt-1">仅用于匹配推荐，不会公开展示。资料页可随时改。</p>
                <input type="hidden" name="role" />
              </div>
            </div>

            <button type="submit" class="btn btn-primary w-full justify-center mt-2" id="auth-submit">登录</button>
          </form>

          <div class="text-center mt-4 text-sm text-ink-500">
            <a href="#" id="auth-toggle" class="text-mint-600 hover:underline">没有账号？去注册</a>
          </div>
        </div>
      </section>
    `;

    let currentMode = mode;
    const titleEl = document.getElementById('auth-title');
    const subEl = document.getElementById('auth-sub');
    const submitEl = document.getElementById('auth-submit');
    const toggleEl = document.getElementById('auth-toggle');
    const extra = document.getElementById('extra-fields');
    const pwHint = document.getElementById('pw-hint');
    const pwInput = document.querySelector('input[name="password"]');

    function setMode(m) {
      currentMode = m;
      if (m === 'register') {
        titleEl.textContent = '创建账号';
        subEl.textContent = '几分钟即可开始匹配';
        submitEl.textContent = '注册并进入';
        toggleEl.textContent = '已有账号？去登录';
        extra.classList.remove('hidden');
      } else {
        titleEl.textContent = '登录';
        subEl.textContent = '使用账号登录开始匹配';
        submitEl.textContent = '登录';
        toggleEl.textContent = '没有账号？去注册';
        extra.classList.add('hidden');
      }
    }
    setMode(mode);

    toggleEl.addEventListener('click', (e) => {
      e.preventDefault();
      setMode(currentMode === 'login' ? 'register' : 'login');
    });

    document.querySelectorAll('[data-radio]').forEach((t) => {
      t.addEventListener('click', () => {
        const group = t.dataset.radio;
        document.querySelectorAll(`[data-radio="${group}"]`).forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const form = document.getElementById('auth-form');
        form.querySelector(`input[name="${group}"]`).value = t.dataset.value;
      });
    });

    function refreshPwHint() {
      const v = pwInput.value;
      if (!v) { pwHint.textContent = ''; return; }
      if (PW_REGEX.test(v)) {
        pwHint.innerHTML = '<span class="text-mint-600">✓ 密码强度合格</span>';
      } else {
        const reasons = [];
        if (v.length < 8) reasons.push('至少 8 位');
        if (!/[A-Za-z]/.test(v)) reasons.push('需要字母');
        if (!/\d/.test(v)) reasons.push('需要数字');
        pwHint.innerHTML = '<span class="text-amber-600">⚠ ' + reasons.join('，') + '</span>';
      }
    }
    pwInput.addEventListener('input', refreshPwHint);

    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const data = Object.fromEntries(new FormData(form).entries());

      // 客户端校验
      if (currentMode === 'register') {
        if (!data.username || data.username.length < 2) {
          UI.toast('用户名至少 2 位', 'warn'); return;
        }
        if (!PW_REGEX.test(data.password || '')) {
          UI.toast('密码至少 8 位，且必须同时含字母和数字', 'warn');
          refreshPwHint();
          return;
        }
      }

      UI.loading(true);
      // 关键：try/finally 保证 loading 一定关闭
      try {
        if (currentMode === 'register') {
          const r = await Prisma.api.register(data);
          Prisma.setToken(r.token);
          Prisma.state.user = r.user;
          // socket 异步连，不 await；连不上也不影响主流程
          try { Prisma.connectSocket(); } catch (e) { console.warn('[socket]', e); }
          UI.toast('注册成功，请完善资料', 'ok');
          // 路由跳转：放到 finally 之后
          setTimeout(() => { location.hash = '#/profile'; }, 200);
        } else {
          const r = await Prisma.api.login({ username: data.username, password: data.password });
          Prisma.setToken(r.token);
          Prisma.state.user = r.user;
          try { Prisma.connectSocket(); } catch (e) { console.warn('[socket]', e); }
          UI.toast('欢迎回来', 'ok');
          setTimeout(() => { location.hash = r.user.profileComplete ? '#/match' : '#/profile'; }, 200);
        }
      } catch (err) {
        console.error('[auth submit]', err);
        UI.toast(err.message || '出错了，请重试', 'error');
      } finally {
        // 二次保险：500ms 后关 loading（让 hashchange 触发的新 resolve 接管）
        setTimeout(() => UI.loading(false), 600);
      }
    });
  };

  window.ViewsAuth = ViewsAuth;
})();
