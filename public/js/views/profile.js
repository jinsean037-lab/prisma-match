// public/js/views/profile.js —— 资料设置
(function () {
  const ViewsProfile = {};

  ViewsProfile.render = async function () {
    if (!Prisma.state.user) { location.hash = '#/auth'; return; }
    const app = document.getElementById('app');
    app.innerHTML = '<div class="text-center text-ink-500 py-10">加载中…</div>';

    const [opts, meRes] = await Promise.all([Prisma.api.profileOptions(), Prisma.api.me()]);
    const me = meRes.user;
    const opts2 = opts;
    const u = me;

    // 确保用户选择过性别/取向
    if (!u.gender || !u.orientation) {
      // 在设置时也提供一次
    }

    app.innerHTML = `
      <section class="grid lg:grid-cols-3 gap-6 py-2">
        <aside class="lg:col-span-1">
          <div class="card p-5 sticky top-20">
            <div class="flex flex-col items-center text-center">
              <img class="avatar-lg" src="${UI.escapeHtml(u.avatar)}" />
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
                <label class="text-sm text-ink-700">头像 URL（可空）</label>
                <input class="input mt-1" id="f-avatar" value="${UI.escapeHtml(u.avatar || '')}" placeholder="https://..." />
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

          <div class="card p-5">
            <h3 class="font-semibold">我想找的人 <span class="text-xs text-ink-500">（不填则不过滤）</span></h3>
            <div class="mt-3 grid sm:grid-cols-2 gap-3">
              <div>
                <label class="text-sm text-ink-700">角色偏好</label>
                <div class="mt-2 flex gap-2 flex-wrap" id="pref-role-wrap">
                  ${(opts2.roles || ['0','0.5','1','side']).map((r) => `
                    <label class="tag ${(u.prefer?.rolePref || []).includes(r) ? 'active' : ''}" data-pref-list="rolePref" data-value="${r}">${(opts2.roleLabels||{})[r] || r}</label>
                  `).join('')}
                </div>
              </div>
              <div>
                <label class="text-sm text-ink-700">身高区间 (cm)</label>
                <div class="mt-2 flex items-center gap-2">
                  <input class="input" type="number" min="130" max="220" id="pref-heightMin" value="${u.prefer?.heightMin || 150}" />
                  <span class="text-ink-500">-</span>
                  <input class="input" type="number" min="130" max="220" id="pref-heightMax" value="${u.prefer?.heightMax || 195}" />
                </div>
              </div>
              <div>
                <label class="text-sm text-ink-700">体重区间 (kg)</label>
                <div class="mt-2 flex items-center gap-2">
                  <input class="input" type="number" min="30" max="150" id="pref-weightMin" value="${u.prefer?.weightMin || 45}" />
                  <span class="text-ink-500">-</span>
                  <input class="input" type="number" min="30" max="150" id="pref-weightMax" value="${u.prefer?.weightMax || 95}" />
                </div>
              </div>
              <div>
                <label class="text-sm text-ink-700">MBTI 偏好</label>
                <div class="mt-2 flex flex-wrap gap-1.5" id="pref-mbti-wrap">
                  ${opts2.mbti.map((m) => `
                    <span class="tag ${(u.prefer?.mbtiPref || []).includes(m) ? 'active' : ''}" data-pref-list="mbtiPref" data-value="${m}">${m}</span>
                  `).join('')}
                </div>
              </div>
              <div>
                <label class="text-sm text-ink-700">星座偏好</label>
                <div class="mt-2 flex flex-wrap gap-1.5" id="pref-zodiac-wrap">
                  ${opts2.zodiac.map((z) => `
                    <span class="tag ${(u.prefer?.zodiacPref || []).includes(z) ? 'active' : ''}" data-pref-list="zodiacPref" data-value="${z}">${z}</span>
                  `).join('')}
                </div>
              </div>
              <div class="sm:col-span-2">
                <label class="text-sm text-ink-700">爱好偏好</label>
                <div class="mt-2 flex flex-wrap gap-1.5" id="pref-hobby-wrap">
                  ${opts2.hobbies.map((h) => `
                    <span class="tag ${(u.prefer?.hobbyPref || []).includes(h) ? 'active' : ''}" data-pref-list="hobbyPref" data-value="${h}">${h}</span>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button class="btn btn-ghost" id="cancel-btn">取消</button>
            <button class="btn btn-primary" id="save-btn">保存</button>
          </div>
        </div>
      </section>
    `;

    // 角色单选
    document.querySelectorAll('[data-role]').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('[data-role]').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      });
    });
    // 爱好单选切换
    document.querySelectorAll('[data-hobby]').forEach((t) => {
      t.addEventListener('click', () => t.classList.toggle('active'));
    });
    // 偏好单值
    document.querySelectorAll('[data-pref]').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll(`[data-pref="${t.dataset.pref}"]`).forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
      });
    });
    // 偏好多选
    document.querySelectorAll('[data-pref-list]').forEach((t) => {
      t.addEventListener('click', () => t.classList.toggle('active'));
    });

    function collectHobbies() {
      return Array.from(document.querySelectorAll('[data-hobby].active')).map((t) => t.dataset.hobby).slice(0, 8);
    }
    function collectPrefList(name) {
      return Array.from(document.querySelectorAll(`[data-pref-list="${name}"].active`)).map((t) => t.dataset.value);
    }
    function collectPrefSingle(name) {
      const el = document.querySelector(`[data-pref="${name}"].active`);
      return el ? el.dataset.value : null;
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
    document.querySelectorAll('input,select,textarea,[data-hobby],[data-role],[data-pref],[data-pref-list]').forEach((e) => e.addEventListener('change', refreshComplete));
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
          prefer: {
            rolePref: collectPrefList('rolePref'),
            heightMin: Number(document.getElementById('pref-heightMin').value),
            heightMax: Number(document.getElementById('pref-heightMax').value),
            weightMin: Number(document.getElementById('pref-weightMin').value),
            weightMax: Number(document.getElementById('pref-weightMax').value),
            mbtiPref: collectPrefList('mbtiPref'),
            zodiacPref: collectPrefList('zodiacPref'),
            hobbyPref: collectPrefList('hobbyPref'),
          },
        };
        const r = await Prisma.api.updateProfile(body);
        Prisma.state.user = r.user;
        UI.toast('已保存', 'ok');
        if (r.user.profileComplete) {
          setTimeout(() => { location.hash = '#/match'; }, 400);
        }
      } catch (e) {
        UI.toast(e.message, 'error');
      } finally {
        setTimeout(() => UI.loading(false), 200);
      }
    });
  };

  window.ViewsProfile = ViewsProfile;
})();
