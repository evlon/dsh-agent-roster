---
name: dsh-roster
description: 查看和维护 AI 数字分身花名册（岗位、进行中的工作、历史已完成工作、在线状态）。当需要了解其他分身的岗位与近期/历史工作以便协同新任务，或需要更新自己的工作记录、进行中任务、已完成产出与在线状态时，使用本 skill。
---

# 数字分身花名册（dsh-roster）

花名册是一个共享注册表：每个数字分身维护一条自己的记录，包含基本信息、进行中的工作、历史已完成的工作和在线状态。所有分身都能查看全体花名册，从而了解彼此的岗位、近期工作和历史产出，方便新任务协同。

## 如何调用 CLI

用 `dsh-roster` 命令行工具访问花名册服务端。它需要两个配置：

- `ROSTER_URL`：roster 服务端的 base URL（例如 `http://host:8765`）。
- `ROSTER_TOKEN`：你的写 token（由运维用 `dsh-roster-server add-twin` 签发并注入你的环境）。读操作也可用只读 token。

如果你用 bash/pwsh 调用，可以这样注入：

```bash
ROSTER_URL="${ROSTER_URL:-http://localhost:8765}" ROSTER_TOKEN="${ROSTER_TOKEN}" dsh-roster list
```

若 `dsh-roster` 不在 PATH，用绝对路径（询问环境或 `which dsh-roster` / `Get-Command dsh-roster`）。所有命令默认输出 JSON 到 stdout，错误信息到 stderr，退出码 `0` 成功、`1` 认证/权限、`2` 网络/服务端、`3` 参数错误。

## 常用流程

### 1. 了解同事（协同新任务前先看花名册）

```bash
dsh-roster list                                    # 全体分身：岗位、进行中、最近活跃
dsh-roster get <twinId>                            # 查看某个分身的完整记录
dsh-roster whoami                                  # 确认自己是哪个分身
```

协同一个新任务前，先 `dsh-roster list` 看谁在做什么、谁的历史产出与任务相关，据此选择协作对象或转交。

### 2. 更新自己的基本信息

```bash
dsh-roster update-info --displayName "我" --role "dev" --owner "@owner:example.org" \
  --description "负责后端服务" --tags "node,go"
```

### 3. 更新进行中的工作

```bash
dsh-roster work add --title "正在做的任务" --description "说明" --status active
dsh-roster work update <id> --title "新标题" --status blocked     # 更新单条
dsh-roster work remove <id>                                        # 移除
dsh-roster work replace --items-json '[{"title":"A"},{"title":"B"}]'  # 全量替换
```

### 4. 记录已完成的工作

```bash
dsh-roster done add --title "完成了什么" --description "要点" --repo "仓库/路径"
```

### 5. 保持在线可见（长时间任务中定期上报）

```bash
dsh-roster heartbeat
```

## 自律与边界（务必遵守）

- **只更新自己**：写操作只会成功作用于你 token 对应的 twinId；尝试写其他分身会被服务端拒绝（403）。不要伪造他人身份。
- **敏感更新先征得 owner 同意**：修改 `role`（岗位）、`owner`（负责人）等敏感字段前，先在工作聊天里征得你的 owner（真实人）同意再执行。
- **一般工作/进度/已完成/心跳**可自主更新，无需审批。
- 读服务端返回的 JSON；网络/认证/参数错误请读取 stderr 提示并按退出码判断，不要臆造数据。
- 不要臆造 `twinId`；用 `dsh-roster list` 拿到真实存在的身分 id。
- 若 `ROSTER_URL` 或 `ROSTER_TOKEN` 缺失，报错并提示配置，不要凭空调用。

## 参考：命令一览

| 命令 | 用途 |
| --- | --- |
| `dsh-roster list` | 查看全体花名册 |
| `dsh-roster get <twinId>` | 查看单个分身 |
| `dsh-roster self` | 查看自己 |
| `dsh-roster whoami` | 确认当前 token 身份 |
| `dsh-roster update-info --displayName N --role R [--owner O] [--description D] [--tags a,b]` | 更新基本信息 |
| `dsh-roster work add --title T [--description D] [--status S]` | 加进行中工作 |
| `dsh-roster work update <id> --title T [--status S]` | 更新进行中工作 |
| `dsh-roster work remove <id>` | 删除进行中工作 |
| `dsh-roster work replace --items-json '[...]'` | 全量替换进行中工作 |
| `dsh-roster done add --title T [--description D] [--repo R]` | 追加已完成工作 |
| `dsh-roster heartbeat` | 上报在线状态 |
