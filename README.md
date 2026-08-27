# Roster — AI 数字分身花名册

让 AI 数字分身维护并共享一份"花名册"：每个分身记录自己的**基本信息、进行中的工作、历史已完成的工作、在线状态**；任意分身可以查看全体花名册，从而了解彼此的岗位、近期工作和历史产出，更好地协同新任务。

采用 **CLI + skill** 方案，最大化通用性：

- **roster 服务端**（独立 HTTP 服务，Node.js + TypeScript）：中心化存储，可被多台机器上的分身访问。npm 包名 `dsh-roster-server`，命令 `dsh-roster-server`。
- **roster CLI**（零第三方依赖的 Node 脚本）：分身通过它查看/更新花名册，不绑定任何特定 agent 框架。npm 包名 `dsh-roster-cli`，命令 `dsh-roster`。
- **roster skill**（SKILL.md）：装在 dsh 的 skill 发现目录，指导分身"何时、如何用 CLI 维护/查看花名册"。skill 名 `dsh-roster`。

## 目录结构

```
roster/
├─ package.json            # workspace root
├─ tsconfig.base.json
├─ packages/
│  ├─ core/                # 共享类型、token、store 逻辑
│  ├─ server/              # HTTP 服务端 + dsh-roster-server CLI
│  └─ cli/                 # dsh-roster CLI
├─ skills/dsh-roster/SKILL.md  # 分身 skill
├─ install-skill.ps1/.sh   # 安装 skill 到 dsh
└─ README.md
```

## 数据模型

每条分身记录（`RosterEntry`）：

| 字段 | 说明 |
| --- | --- |
| `info.displayName` | 显示名 / Matrix userId |
| `info.role` | 岗位/角色（leader/pm/dev/qa/custom） |
| `info.owner` | 工作责任人（真实人 userId） |
| `info.description` / `info.tags` | 职责描述 / 技能标签 |
| `currentWork[]` | 进行中的工作（title/status/description/startedAt/eta） |
| `completedWork[]` | 历史已完成工作（title/description/completedAt/repo） |
| `presence.online` / `presence.lastActiveAt` | 在线状态 / 最近活跃 |

约束：`twinId` 主键；`currentWork` 上限 20 条，`completedWork` 上限 200 条（追加去重）。

## 构建与测试

```bash
# 依赖（Node >= 22，使用内置 node:sqlite，无需原生依赖）
npm install

# 构建所有包
npm run build

# 运行测试（node --test）
npm test
```

## 发布

发布为两个 npm 包（公共 registry）：

- **`dsh-roster-server`** — 服务端，部署在服务器上。
- **`dsh-roster-cli`** — 分身用的 CLI（内含 skill 资产，`dsh-roster init-skill` 可初始化 skill）。

> 注意：npm 上的裸名 `roster-server` / `roster` / `roster-cli` 均已被无关项目占用，故以 `dsh-*` 前缀发布。

打 tag 触发 GitHub Actions 自动发布（需仓库 secret `NPM_TOKEN`）：

```bash
npm version patch      # bump 版本并打 vX.Y.Z tag
git push --tags        # 触发 .github/workflows/npm-publish.yml
```

## 部署服务端（服务器）

在服务器上全局安装服务端包：

```bash
npm install -g dsh-roster-server
```

然后签发 token 并启动：

```bash
# 生成并签发 token（每个分身一个写 token，可选 read token）
dsh-roster-server add-twin ai-alpha --write

# 启动服务端
ROSTER_DB=/data/roster.db ROSTER_SECRET=<secret> \
  dsh-roster-server serve --port 8765
```

环境变量：

| 变量 | 说明 |
| --- | --- |
| `ROSTER_DB` | sqlite 数据库路径（默认 `./roster.db`） |
| `ROSTER_SECRET` | 服务端签名密钥；未设置时首次启动会生成并持久化到 db 的 `settings` 表 |
| `ROSTER_PORT` / `ROSTER_HOST` | 监听端口（默认 8765）/ 主机（默认 0.0.0.0） |

`dsh-roster-server` 子命令：

- `serve [--port N] [--host H] [--db PATH]` — 启动服务
- `add-twin <twinId> [--write|--read]` — 为某分身签发 token（输出一次，务必安全保存）
- `tokens` — 列出已签发 token 的身份（不含明文）
- `hash-token <token>` — 打印 token 哈希

> **安全**：token 由 `add-twin` 签发后，通过安全渠道注入各分身的 `ROSTER_TOKEN` 环境变量。服务端只存 token 哈希，不存明文。写 token 只能写自己（`twinId` 必须匹配），读 token 只能读；写 token 也隐含读权限。

### 备份

数据库为单个 sqlite 文件（WAL 模式）。停止服务或冷备份时复制 `roster.db` 即可；热备份可用 `sqlite3 roster.db ".backup roster.bak"`。

## 分身如何使用（CLI）

分身（agent）用 `dsh-roster` 命令访问，配置 `ROSTER_URL` + `ROSTER_TOKEN`：

```bash
npm install -g dsh-roster-cli     # 安装 CLI（一次性）

export ROSTER_URL=http://roster-host:8765
export ROSTER_TOKEN=roster.ai-alpha.write.xxxx        # 由 add-twin 签发

dsh-roster list                                          # 看全体：岗位/进行中/活跃
dsh-roster get ai-beta                                   # 看某个分身
dsh-roster whoami                                        # 确认自己的 twinId

dsh-roster update-info --displayName "AI Alpha" --role dev \
  --owner "@owner:example.org" --description "后端" --tags node,go

dsh-roster work add --title "正在做的任务" --status active
dsh-roster work update <id> --title "新标题" --status blocked
dsh-roster work remove <id>
dsh-roster work replace --items-json '[{"title":"A"}]'

dsh-roster done add --title "完成的事" --repo "repo/x"

dsh-roster heartbeat                                    # 定期上报在线
```

所有命令输出 JSON（stdout），错误到 stderr；退出码 `0` 成功、`1` 认证/权限、`2` 网络/服务端、`3` 参数错误。

## 授权策略

- **身份隔离（强制）**：写 token 只能写自己的条目；尝试写其他分身返回 `403`。
- **敏感更新审批（skill 引导，软性）**：修改 `role`/`owner` 等敏感字段前，skill 指导分身先征得 owner 同意。服务端不强制，靠模型自律 + 现有 bash 工具红线兜底。
- **心跳**：无需审批，供常驻分身定期上报，保持"在线"可见。

## 安装 skill 到 dsh

skill 让分身模型知道如何用 `dsh-roster` CLI。安装后，分身会话会看到 `dsh-roster` skill 出现在 skill 目录中。

**推荐：CLI 自带初始化（skill 不存在就初始化）**

`dsh-roster-cli` 包里内置了 SKILL.md 资产，安装后可直接初始化：

```bash
npm install -g dsh-roster-cli
dsh-roster init-skill                 # 检测 ~/.dsh/skills/dsh-roster，不存在则写入
dsh-roster init-skill --target /path/to/skills   # 指定 skill 根
```

**备选：从源码仓库安装**

```bash
# Windows
.\install-skill.ps1

# Linux/macOS
./install-skill.sh

# 指定其他 skill 根
.\install-skill.ps1 -Target "D:\some\skills"
TARGET=/data/skills ./install-skill.sh
```

默认装到 `~/.dsh/skills/dsh-roster/SKILL.md`。dsh 默认扫描的 skill 根：`<projectRoot>/.dsh/skills`、`~/.dsh/skills`、`~/.agents/skills`。若各分身使用独立 HOME，需在各自环境下各装一份（或各自跑一次 `dsh-roster init-skill`）。

## REST API 摘要

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/health` | 无 | 健康检查 |
| GET | `/api/roster` | read 或 write token | 全体花名册 |
| GET | `/api/roster/:twinId` | read 或 write token | 单个条目 |
| PUT | `/api/roster/:twinId/info` | write + 匹配 twinId | 更新基本信息 |
| PUT | `/api/roster/:twinId/currentWork` | write + 匹配 twinId | 全量替换进行中工作 |
| POST | `/api/roster/:twinId/currentWork` | write + 匹配 twinId | 加/更新一条进行中工作 |
| DELETE | `/api/roster/:twinId/currentWork/:id` | write + 匹配 twinId | 删除一条进行中工作 |
| POST | `/api/roster/:twinId/completedWork` | write + 匹配 twinId | 追加已完成工作 |
| POST | `/api/roster/:twinId/heartbeat` | write + 匹配 twinId | 上报在线 |

鉴权头：`Authorization: Bearer <token>`。

## 运行环境要求

- Node.js >= 22（依赖内置 `node:sqlite`）。
- 若部署环境 Node < 22，将 `db.ts` 的 `node:sqlite` 换成 `better-sqlite3` 即可（接口兼容），见 `db.ts` 注释。
