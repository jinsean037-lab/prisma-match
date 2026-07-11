# Prisma · 清新交友匹配平台

> 面向男同性恋群体的交友匹配平台原型。基于身高体重、MBTI、星座、爱好等真实属性做加权匹配，**角色**用 0/1/0.5/side 区分。先打招呼、对方同意后再深入聊；内置**三层敏感词过滤**（含谐音/数字/符号变体）。

## ✨ 特性

- **清新简洁 UI** — Tailwind 渐变主题（薄荷 + 暖橘），卡片式布局
- **多维匹配** — 身高/体重/MBTI/星座/爱好 + **角色兼容**（0↔1 完美互补；0.5 跟谁都配；side 跟 side 配）
- **3 条消息门控** — 未确认前主动方最多发 3 条，对方点"同意深入聊"才能继续；随时可拒绝/屏蔽
- **敏感词三层过滤**：
  1. 原文 substring 匹配
  2. 归一化后 substring（l33t、加空格、拆字都拦）
  3. 中文/拉丁混合文本的拼音滑动窗口（关键——抓"开 fang"≈"开房"这种）
- **实时聊天** — Socket.io 推送，敏感词命中时实时拦截并显示具体拦截词
- **零原生依赖** — 纯 JSON 存储，无 SQLite/Redis，开箱即跑

## 🚀 本地启动

```bash
cd <项目目录>
npm install
node scripts/seed.js   # （可选）灌入 6 个示例用户
npm start              # → http://localhost:3000
```

需要 Node.js 18+。已装 4 个包（express / socket.io / bcryptjs / pinyin），无原生编译。

### 示例账号（运行 `seed.js` 后可用，密码统一 `demo1234`）

| 用户名     | 昵称 | 角色 | 身高 | 体重 | MBTI  | 星座 |
| ---------- | ---- | ---- | ---- | ---- | ----- | ---- |
| xiaoYou    | 小柚 | 0    | 178  | 65   | INFP  | 双子 |
| muSen      | 木森 | 1    | 182  | 70   | ENFP  | 天秤 |
| baiYe      | 白夜 | 0.5  | 174  | 60   | INFJ  | 天蝎 |
| yuXin      | 雨欣 | side | 168  | 55   | ENFJ  | 巨蟹 |
| anQi       | 安琪 | 0    | 172  | 58   | ISFP  | 双鱼 |
| shuYu      | 舒雨 | 1    | 175  | 63   | ENTP  | 水瓶 |

## 🧪 测试

```bash
# 1) 敏感词自检（无需启动服务）
node scripts/test-filter.js

# 2) 端到端冒烟：注册 / 资料 / 匹配 / 搭讪 / 门控 / 确认 / 敏感词拦截
node scripts/e2e.js
```

## ☁️ 部署到 Render

仓库里已带 `render.yaml`，Render 会自动识别：

1. 把代码推到 GitHub
2. Render 控制台 → **New** → **Blueprint**，选你的仓库
3. Render 读 `render.yaml` 自动建 Web Service
4. 等 1-2 分钟 → 拿到 `https://prisma-match.onrender.com`

⚠️ **Render 免费版的磁盘是临时的**，服务重启会丢 `data/*.json`。要做数据持久化，方案：
- 免费方案：用 Render 的 **Persistent Disk**（$1/月 1GB）挂到 `/opt/render/project/src/data`
- 推荐方案：换 PostgreSQL（Render 免费 PostgreSQL 或 Supabase / Neon）

## 🔐 密码规则

- 8 位以上
- 必须**同时**包含字母和数字（不允许纯字母或纯数字）
- 客户端 + 服务端都校验，提示具体缺什么

## 📂 目录结构

```
.
├── server.js                 # 入口（Express + Socket.io）
├── package.json
├── render.yaml               # Render 部署配置
├── lib/
│   ├── store.js              # JSON 存储
│   ├── auth.js               # token 鉴权
│   ├── filter.js             # 敏感词三层过滤
│   └── match.js              # 匹配打分（含角色兼容）
├── routes/
│   ├── auth.js               # 注册/登录/me
│   ├── profile.js            # 资料 CRUD + 选项
│   ├── match.js              # 候选列表
│   └── chat.js               # 搭讪/消息/门控/确认/屏蔽
├── public/                   # 前端
│   ├── index.html
│   ├── css/style.css
│   ├── js/                   # api / ui / app / views/{auth,profile,match,chat}
│   └── img/logo.svg
├── data/
│   └── sensitive.json        # 敏感词库（git 保留；其他运行时数据 git 忽略）
├── scripts/
│   ├── seed.js               # 灌入示例用户
│   ├── test-filter.js        # 敏感词自检
│   └── e2e.js                # 端到端测试
└── README.md
```

## 🛡️ 敏感词过滤示例

| 输入                       | 命中词   | 命中层      |
| -------------------------- | -------- | ----------- |
| `约 炮 加 微信`            | 约pao    | pinyin      |
| `我 们 去 开 fang 吧`      | 开房     | pinyin      |
| `b1tch`                    | bitch    | normalized  |
| `p0rn 网站`                | porn     | normalized  |
| `F**k this`                | fk       | normalized  |
| `yue pao 加我`             | yuepao   | normalized  |

## ⚠️ 生产化清单

当前是原型，上线前请：

1. **敏感词**：接入专业审核服务（阿里云内容安全、网易易盾等）做二次校验
2. **存储**：JSON 换 PostgreSQL，敏感词换云端词库
3. **鉴权**：内存 token 换 JWT + Redis
4. **HTTPS / WSS**：必须
5. **图片/头像**：换对象存储 + CDN
6. **未成年保护**：注册流程加年龄校验（≥18）
7. **审计日志**：所有"屏蔽/拒绝/敏感词命中"写日志
8. **限流**：登录/注册/发消息接口加 rate limit
9. **实名 + 真人验证**：防机器人/诈骗
10. **隐私**：加密敏感字段；提供账号注销 + 数据导出

## 📜 License

MIT
