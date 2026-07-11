// public/js/views/profile.js —— 资料设置（精简版：基本资料 + 角色 + 爱好 + 头像预设）
(function () {
  const ViewsProfile = {};

  // 头像预设（用 DiceBear 生成 SVG，固定 seed 保证一致）
  const AVATAR_SEEDS = [
    'cat', 'dog', 'fox', 'panda', 'koala',
    'lion', 'tiger', 'rabbit', 'wolf', 'bear',
    'owl', 'penguin', 'unicorn', 'dragon',
  ];
  function avatarUrl(seed) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  }
  // 当前用户选中的 avatar URL → 反查 seed
  function seedOf(url) {
    if (!url) return AVATAR_SEEDS[0];
    const m = /[?&]seed=([^&]+)/.exec(url);
    return m ? decodeURIComponent(m[1]) : AVATAR_SEEDS[0];
  }

  ViewsProfile.render = async function () {
    if (!Prisma.state.user) { location.hash = '#/auth'; return; }
    const app = document.getElementById('app');
    app.innerHTML = '<div class="text-center text-ink-500 py-10">加载中…</div>';

    try {
      // options 是公开接口；me() 失败时用缓存
      const opts = await Prisma.api.profileOptions();
      let u = Prisma.state.user;
      try {
        const meRes = await Prisma.api.me();
        if (meRes && meRes.user) {
          u = meRes.user;
          Prisma.setUser(u);
        }
      } catch (e) {
        console.warn('[profile] /me 失败，用缓存：', e.message);
      }
      renderProfile(app, u, opts);
    } catch (e) {
      app.innerHTML = `<div class="text-center py-10 max-w-md mx-auto">
        <div class="text-red-500 mb-2">资料加载失败：${UI.escapeHtml(e.message)}</div>
        <div class="text-xs text-ink-500 mb-3">可能是网络或服务暂时不可用，请重试</div>
        <div class="flex gap-2 justify-center">
          <button class="btn btn-primary" onclick="location.reload()">重试</button>
          <button class="btn btn-ghost" onclick="location.hash='#/auth'">返回登录</button>
        </div>
      </div>`;
    }
  };

  function renderProfile(app, u, opts2) {
    const currentSeed = seedOf(u.avatar);

    app.innerHTML = `
      <section class="grid lg:grid-cols-3 gap-6 py-2">
        <aside class="lg:col-span-1">
          <div class="card p-5 sticky top-20">
            <div class="flex flex-col items-center text-center">
              <img class="avatar-lg" id="preview-avatar" src="${UI.escapeHtml(avatarUrl(currentSeed))}" />
              <div class="mt-3 font-semibold">${UI.escapeHtml(u.nickname || u.username)}</div>
              <div class="text-xs text-ink-500">@${UI.escapeHtml(u.username)}</div>
              <div class="mt-2 flex gap-1.5 flex-wrap justify-center">
                ${u.role ? `<span class="chip chip-pink">${UI.escapeHtml(u.role)}</span>` : '<span class="chip">未填角色</span>'}
              </div>
            </div>
            <hr class="my-4 border-mint-100" />
            <div class="text-sm text-ink-500 space-y-1">
              <div>完成度：<span id="complete-pct" class="text-mint-600 font-medium">0%</span></div>
              <div class="progress"><div id="complete-bar" style="width:0%"></div></div>
            </div>
          </div>
        </aside>

        <div class="lg:col-span-2 space-y-4">
          <div class="card p-5">
            <h3 class="font-semibold">基本资料</h3>
            <div class="mt-3 grid sm:grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-ink-700">昵称</label>
                <input class="input mt-1" id="f-nickname" value="${UI.escapeHtml(u.nickname || '')}" maxlength="16" />
              </div>
              <div>
                <label class="text-sm text-ink-700">身高 (cm)</label>
                <input class="input mt-1" id="f-height" type="number" min="130" max="220" value="${u.height || ''}" />
              </div>
              <div>
                <label class="text-sm text-ink-700">体重 (kg)</label>
                <input class="input mt-1" id="f-weight" type="number" min="30" max="150" value="${u.weight || ''}" />
              </div>
              <div>
                <label class="text-sm text-ink-700">MBTI</label>
                <select class="select mt-1" id="f-mbti">
                  <option value="">选择</option>
                  ${opts2.mbti.map((m) => `<option value="${m}" ${u.mbti === m ? 'selected' : ''}>${m}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="text-sm text-ink-700">星座</label>
                <select class="select mt-1" id="f-zodiac">
                  <option value="">选择</option>
                  ${opts2.zodiac.map((z) => `<option value="${z}" ${u.zodiac === z ? 'selected' : ''}>${z}</option>`).join('')}
                </select>
              </div>
              <div class="sm:col-span-2">
                <label class="text-sm text-ink-700">自我介绍</label>
                <textarea class="textarea mt-1" id="f-bio" maxlength="300" placeholder="说说你是什么样的人，喜欢什么…">${UI.escapeHtml(u.bio || '')}</textarea>
              </div>
            </div>
          </div>

          <div class="card p-5">
            <h3 class="font-semibold">选个头像</h3>
            <div class="mt-3 grid grid-cols-7 gap-2" id="avatar-picker">
              ${AVATAR_SEEDS.map((s) => `
                <label class="cursor-pointer rounded-full border-2 ${s === currentSeed ? 'border-mint-500 ring-2 ring-mint-200' : 'border-transparent hover:border-mint-200'} p-0.5 transition" data-avatar-seed="${UI.escapeHtml(s)}">
                  <img class="w-full aspect-square rounded-full bg-mint-50" src="${UI.escapeHtml(avatarUrl(s))}" alt="${UI.escapeHtml(s)}" />
                </label>
              `).join('')}
            </div>
            <input type="hidden" id="f-avatar" value="${UI.escapeHtml(avatarUrl(currentSeed))}" />
          </div>

          <div class="card p-5">
            <h3 class="font-semibold">我的角色</h3>
            <div class="mt-3 flex gap-2 flex-wrap">
              ${(opts2.roles || ['0','0.5','1','side']).map((r) => `
                <label class="tag ${u.role === r ? 'active' : ''}" data-role="${r}">${(opts2.roleLabels||{})[r] || r}</label>
              `).join('')}
            </div>
            <p class="text-xs text-ink-500 mt-2">只用于匹配推荐。0↔1 完美互补；0.5 跟谁都行；side 跟 side 配。</p>
          </div>

          <div class="card p-5">
            <h3 class="font-semibold">爱好（最多选 8 个）</h3>
            <div class="mt-3 flex flex-wrap gap-2" id="hobbies-wrap">
              ${opts2.hobbies.map((h) => `
                <span class="tag ${(u.hobbies || []).includes(h) ? 'active' : ''}" data-hobby="${h}">${h}</span>
              `).join('')}
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost" id="cancel-btn">取消</button>
            <button class="btn btn-primary" id="save-btn">保存</button>
          </div>
        </div>
      </section>
    `;

    // 头像选择
    let selectedAvatar = avatarUrl(currentSeed);
    document.querySelectorAll('[data-avatar-seed]').forEach((el) => {
      el.addEventListener('click', () => {
        const seed = el.dataset.avatarSeed;
        selectedAvatar = avatarUrl(seed);
        document.getElementById('f-avatar').value = selectedAvatar;
        document.getElementById('preview-avatar').src = selectedAvatar;
        document.querySelectorAll('[data-avatar-seed]').forEach((x) => {
          x.classList.remove('border-mint-500', 'ring-2', 'ring-mint-200');
          x.classList.add('border-transparent');
        });
        el.classList.remove('border-transparent');
        el.classList.add('border-mint-500', 'ring-2', 'ring-mint-200');
      });
    });

    // 角色单选
    document.querySelectorAll('[data-role]').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('[data-role]').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        refreshComplete();
      });
    });
    // 爱好单选切换
    document.querySelectorAll('[data-hobby]').forEach((t) => {
      t.addEventListener('click', () => {
        t.classList.toggle('active');
        refreshComplete();
      });
    });

    function collectHobbies() {
      return Array.from(document.querySelectorAll('[data-hobby].active')).map((t) => t.dataset.hobby).slice(0, 8);
    }
    function collectRole() {
      const el = document.querySelector('[data-role].active');
      return el ? el.dataset.role : '';
    }

    function refreshComplete() {
      const checks = [
        !!document.getElementById('f-nickname').value.trim(),
        Number(document.getElementById('f-height').value) > 0,
        Number(document.getElementById('f-weight').value) > 0,
        !!document.getElementById('f-mbti').value,
        !!document.getElementById('f-zodiac').value,
        collectHobbies().length >= 3,
        document.getElementById('f-bio').value.trim().length >= 10,
        !!collectRole(),
      ];
      const done = checks.filter(Boolean).length;
      const pct = Math.round((done / checks.length) * 100);
      document.getElementById('complete-pct').textContent = pct + '%';
      document.getElementById('complete-bar').style.width = pct + '%';
    }
    document.querySelectorAll('input,select,textarea,[data-hobby],[data-role]').forEach((e) => e.addEventListener('change', refreshComplete));
    refreshComplete();

    document.getElementById('cancel-btn').addEventListener('click', () => history.back());
    document.getElementById('save-btn').addEventListener('click', async () => {
      UI.loading(true);
      try {
        const body = {
          nickname: document.getElementById('f-nickname').value.trim(),
          avatar: document.getElementById('f-avatar').value.trim(),
          height: Number(document.getElementById('f-height').value),
          weight: Number(document.getElementById('f-weight').value),
          mbti: document.getElementById('f-mbti').value,
          zodiac: document.getElementById('f-zodiac').value,
          bio: document.getElementById('f-bio').value.trim(),
          role: collectRole(),
          hobbies: collectHobbies(),
        };
        const r = await Prisma.api.updateProfile(body);
        Prisma.setUser(r.user);
        UI.toast('已保存', 'ok');
        if (r.user.profileComplete) {
          setTimeout(() => { location.hash = '#/match'; }, 400);
        }
      } catch (e) {
        console.error('[save profile]', e);
        UI.toast('保存失败：' + e.message, 'error');
        // 401 时：可能是 token 失效，帮用户清掉回到登录
        if (e.status === 401) {
          Prisma.setToken(null);
          Prisma.setUser(null);
          setTimeout(() => { location.hash = '#/auth'; }, 1000);
        }
      } finally {
        setTimeout(() => UI.loading(false), 200);
      }
    });
  }

  window.ViewsProfile = ViewsProfile;
})();
