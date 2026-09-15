# roster-server — dsh-roster-server（Node ESM，已预编译 dist）
#
# 构建（ARM64 集群）：
#   podman build --platform linux/arm64 -t roster-server:<tag> .
#
# 入口：packages/server/dist/server/src/bin.js serve（注意需 serve 子命令）
# 数据：sqlite 文件，路径由 ROSTER_DB 指定
# 端口：ROSTER_PORT（默认 8765）
FROM node:22-slim

WORKDIR /app

# 工作区结构：core 与 server 两个包（零外部依赖）
COPY packages ./packages
COPY package.json ./

# 非 root 运行
RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV NODE_ENV=production
ENV ROSTER_PORT=8765
ENV ROSTER_DB=/data/roster.db

EXPOSE 8765

# 注意：bin.js 需要 serve 子命令
CMD ["node", "packages/server/dist/server/src/bin.js", "serve"]
