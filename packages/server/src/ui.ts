/**
 * Roster WEB UI: a public read-only dashboard rendered by the roster server.
 *
 * This module ships a single self-contained HTML page (inline CSS + JS, no
 * build step) plus a public read-only JSON endpoint (`/ui/api/roster`) used by
 * the page. It is intended for trusted internal display of the twin roster.
 *
 * Security: the public endpoint exposes only the display fields already present
 * in the roster (no tokens/secrets). It can be disabled via the
 * `ROSTER_UI_PUBLIC=false` env (default true).
 *
 * @module @roster/server
 */

import type { RosterStore } from '../../core/src/index.js'

/** Read-only public projection of a twin entry for display. */
export interface UiRosterItem {
  twinId: string
  displayName: string
  role: string
  owner: string
  description?: string
  tags: string[]
  online: boolean
  lastActiveAt: number
  updatedAt: number
  currentWork: { id: string; title: string; status: string; description?: string }[]
  completedWork: { id: string; title: string; completedAt: number; repo?: string }[]
}

/** Build the public display list from the store (no auth, public view). */
export function uiRosterItems(store: RosterStore): UiRosterItem[] {
  return store.listViews().map((v) => ({
    twinId: v.twinId,
    displayName: v.info.displayName,
    role: v.info.role,
    owner: v.info.owner,
    description: v.info.description,
    tags: v.info.tags ?? [],
    online: v.presence.online,
    lastActiveAt: v.presence.lastActiveAt,
    updatedAt: v.updatedAt,
    currentWork: v.currentWork.map((w) => ({
      id: w.id,
      title: w.title,
      status: w.status,
      description: w.description,
    })),
    completedWork: v.completedWork.map((c) => ({
      id: c.id,
      title: c.title,
      completedAt: c.completedAt,
      repo: c.repo,
    })),
  }))
}

/** Rendered HTML page (public). */
export function renderUiPage(): string {
  return uiHtml
}

/**
 * Self-contained single-page UI.
 * Fetches `/ui/api/roster`, renders twin cards, stats and filters.
 */
const uiHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>数字员工花名册 · Roster</title>
<style>
  :root {
    --bg: #0f1420;
    --bg-2: #171e2e;
    --card: #1b2336;
    --card-2: #202a40;
    --border: #2a3550;
    --text: #e8edf7;
    --text-dim: #9aa7c3;
    --accent: #5b8cff;
    --accent-2: #8ab4ff;
    --green: #34d399;
    --amber: #fbbf24;
    --red: #f87171;
    --pink: #f472b6;
    --violet: #a78bfa;
    --teal: #2dd4bf;
    --shadow: 0 8px 30px rgba(0,0,0,.35);
    --radius: 16px;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
    background:
      radial-gradient(1200px 500px at 80% -10%, rgba(91,140,255,.18), transparent 60%),
      radial-gradient(900px 500px at 10% -20%, rgba(167,139,250,.14), transparent 60%),
      var(--bg);
    color: var(--text);
    min-height: 100vh;
  }
  .wrap { max-width: 1280px; margin: 0 auto; padding: 28px 20px 60px; }
  header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 16px; flex-wrap: wrap; margin-bottom: 22px;
  }
  .brand { display: flex; align-items: center; gap: 14px; }
  .logo {
    width: 46px; height: 46px; border-radius: 13px;
    background: linear-gradient(135deg, var(--accent), var(--violet));
    display: grid; place-items: center; font-weight: 800; font-size: 22px; color: #fff;
    box-shadow: var(--shadow);
  }
  h1 { font-size: 24px; letter-spacing: .5px; }
  h1 small { display: block; font-size: 13px; color: var(--text-dim); font-weight: 500; margin-top: 2px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; }
  .stat {
    background: var(--card); border: 1px solid var(--border); border-radius: 14px;
    padding: 10px 18px; text-align: center; min-width: 84px;
  }
  .stat b { display: block; font-size: 22px; }
  .stat span { font-size: 12px; color: var(--text-dim); }
  .stat.online b { color: var(--green); }
  .toolbar {
    display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 20px;
  }
  .search {
    flex: 1; min-width: 220px; background: var(--card); border: 1px solid var(--border);
    color: var(--text); border-radius: 11px; padding: 11px 14px; font-size: 14px; outline: none;
    transition: border-color .2s;
  }
  .search:focus { border-color: var(--accent); }
  .filter { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip {
    background: var(--card); border: 1px solid var(--border); color: var(--text-dim);
    border-radius: 20px; padding: 7px 14px; font-size: 13px; cursor: pointer; user-select: none;
    transition: all .18s;
  }
  .chip:hover { border-color: var(--accent-2); color: var(--text); }
  .chip.active { background: linear-gradient(135deg, var(--accent), var(--violet)); color: #fff; border-color: transparent; }
  .grid {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px;
  }
  .card {
    background: linear-gradient(180deg, var(--card-2), var(--card));
    border: 1px solid var(--border); border-radius: var(--radius); padding: 18px;
    box-shadow: var(--shadow); transition: transform .18s, border-color .18s;
    display: flex; flex-direction: column; gap: 12px;
  }
  .card:hover { transform: translateY(-3px); border-color: var(--accent-2); }
  .top { display: flex; align-items: center; gap: 12px; }
  .avatar {
    width: 48px; height: 48px; border-radius: 13px; flex-shrink: 0;
    display: grid; place-items: center; font-weight: 800; font-size: 20px; color: #fff;
    background: linear-gradient(135deg, var(--c1, var(--accent)), var(--c2, var(--violet)));
  }
  .who { flex: 1; min-width: 0; }
  .name { font-size: 16px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .role {
    font-size: 11px; padding: 2px 9px; border-radius: 20px; font-weight: 600; letter-spacing: .3px;
  }
  .role.dev { background: rgba(91,140,255,.18); color: var(--accent-2); }
  .role.qa  { background: rgba(244,114,182,.18); color: var(--pink); }
  .role.pm  { background: rgba(251,191,36,.16); color: var(--amber); }
  .role.leader { background: rgba(167,139,250,.18); color: var(--violet); }
  .role.custom { background: rgba(45,212,191,.16); color: var(--teal); }
  .twinid { font-size: 12px; color: var(--text-dim); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .owner { font-size: 12px; color: var(--text-dim); margin-top: 2px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; margin-right: 5px; }
  .dot.on { background: var(--green); box-shadow: 0 0 8px var(--green); }
  .dot.off { background: #4b5563; }
  .desc { font-size: 13px; color: var(--text-dim); line-height: 1.5; }
  .tags { display: flex; flex-wrap: wrap; gap: 6px; }
  .tag { font-size: 11px; background: var(--bg-2); border: 1px solid var(--border); color: var(--accent-2); border-radius: 8px; padding: 3px 9px; }
  .section-title { font-size: 12px; font-weight: 700; color: var(--text-dim); text-transform: uppercase; letter-spacing: .6px; margin: 2px 0 6px; }
  .work { display: flex; flex-direction: column; gap: 6px; }
  .work-item {
    display: flex; align-items: center; gap: 8px; background: var(--bg-2);
    border: 1px solid var(--border); border-radius: 10px; padding: 7px 10px; font-size: 13px;
  }
  .w-status { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .w-status.active { background: var(--green); }
  .w-status.paused { background: var(--amber); }
  .w-status.blocked { background: var(--red); }
  .work-item span { flex: 1; }
  .done-item {
    display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-dim);
    padding: 3px 2px;
  }
  .done-item .ck { color: var(--green); flex-shrink: 0; }
  .done-item .repo { font-size: 11px; color: var(--accent-2); background: var(--bg-2); padding: 1px 7px; border-radius: 6px; }
  .empty { grid-column: 1 / -1; text-align: center; padding: 60px 20px; color: var(--text-dim); }
  .empty .emoji { font-size: 42px; margin-bottom: 10px; }
  .muted { color: var(--text-dim); }
  .foot { text-align: center; margin-top: 34px; font-size: 12px; color: var(--text-dim); }
  footer .dot { width: 7px; height: 7px; }
  .live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--green); margin-right: 6px; animation: pulse 1.6s infinite; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="brand">
      <div class="logo">R</div>
      <h1>数字员工花名册<small>AI Digital Twin Roster · 岗位 · 近期工作 · 历史产出</small></h1>
    </div>
    <div class="stats">
      <div class="stat"><b id="stat-total">0</b><span>成员</span></div>
      <div class="stat online"><b id="stat-online">0</b><span>在线</span></div>
      <div class="stat"><b id="stat-roles">0</b><span>岗位</span></div>
    </div>
  </header>

  <div class="toolbar">
    <input class="search" id="search" type="text" placeholder="搜索姓名 / 分身ID / 技能 / 职责…" autocomplete="off" />
    <div class="filter" id="filters"></div>
  </div>

  <div class="grid" id="grid"><div class="empty"><div class="emoji">⏳</div>正在加载花名册…</div></div>

  <footer class="foot">
    <span class="live-dot"></span>实时数据 · 每 <span id="refresh-hint">30</span> 秒自动刷新
  </footer>
</div>

<script>
const ROLE_LABEL = { leader:'Leader', pm:'PM', dev:'Dev', qa:'QA' };
const ROLE_COLORS = {
  dev: ['#5b8cff','#a78bfa'],
  qa: ['#f472b6','#fb7185'],
  pm: ['#fbbf24','#f97316'],
  leader: ['#a78bfa','#6366f1'],
  custom: ['#2dd4bf','#0ea5e9'],
};
const STATUS_LABEL = { active:'进行中', paused:'暂停', blocked:'阻塞' };

let items = [];
let roleFilter = 'all';

function init() {
  document.getElementById('search').addEventListener('input', render);
  load();
  setInterval(load, 30000);
}

async function load() {
  try {
    const res = await fetch('/ui/api/roster', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    items = data.roster || [];
    renderFilters();
    render();
  } catch (err) {
    document.getElementById('grid').innerHTML =
      '<div class="empty"><div class="emoji">⚠️</div>无法加载花名册：' + (err.message || err) + '</div>';
  }
}

function renderFilters() {
  const roles = new Set(items.map(i => i.role).filter(Boolean));
  const box = document.getElementById('filters');
  box.innerHTML = '';
  const add = (val, label) => {
    const c = document.createElement('div');
    c.className = 'chip' + (roleFilter === val ? ' active' : '');
    c.textContent = label;
    c.onclick = () => { roleFilter = val; renderFilters(); render(); };
    box.appendChild(c);
  };
  add('all', '全部');
  [...roles].sort().forEach(r => add(r, ROLE_LABEL[r] || r));
}

function render() {
  document.getElementById('stat-total').textContent = items.length;
  const online = items.filter(i => i.online).length;
  document.getElementById('stat-online').textContent = online;
  document.getElementById('stat-roles').textContent = new Set(items.map(i => i.role).filter(Boolean)).size;

  const q = document.getElementById('search').value.trim().toLowerCase();
  const grid = document.getElementById('grid');
  const list = items.filter(i =>
    (roleFilter === 'all' || i.role === roleFilter) &&
    (!q || [i.displayName, i.twinId, i.role, i.owner, (i.tags||[]).join(' '), i.description||'']
      .join(' ').toLowerCase().includes(q))
  );

  if (list.length === 0) {
    grid.innerHTML = '<div class="empty"><div class="emoji">🔍</div>没有匹配的分身</div>';
    return;
  }
  grid.innerHTML = list.map(card).join('');
}

function card(i) {
  const cols = ROLE_COLORS[i.role] || ROLE_COLORS.custom;
  const initial = (i.displayName || i.twinId || '?').charAt(0).toUpperCase();
  const roleCls = (i.role in ROLE_LABEL) ? i.role : 'custom';
  const now = Date.now();
  const activeMin = Math.round((now - (i.lastActiveAt||0)) / 60000);
  const onlineTxt = i.online
    ? (activeMin < 1 ? '刚刚活跃' : activeMin < 60 ? activeMin + ' 分钟前活跃' : '活跃')
    : '离线';
  const work = (i.currentWork||[]).map(w =>
    '<div class="work-item"><span class="w-status ' + w.status + '"></span><span>' + esc(w.title) + '</span></div>'
  ).join('');
  const done = (i.completedWork||[]).slice(0,6).map(d =>
    '<div class="done-item"><span class="ck">✓</span><span>' + esc(d.title) + '</span>' +
    (d.repo ? '<span class="repo">' + esc(d.repo) + '</span>' : '') +
    '<span class="muted">' + fmtTime(d.completedAt) + '</span></div>'
  ).join('');
  const tags = (i.tags||[]).map(t => '<span class="tag">' + esc(t) + '</span>').join('');

  return '<article class="card" style="--c1:' + cols[0] + ';--c2:' + cols[1] + '">' +
    '<div class="top">' +
      '<div class="avatar">' + esc(initial) + '</div>' +
      '<div class="who">' +
        '<div class="name">' + esc(i.displayName || i.twinId) +
          '<span class="role ' + roleCls + '">' + (ROLE_LABEL[i.role] || i.role || '—') + '</span></div>' +
        '<div class="twinid">' + esc(i.twinId) + '</div>' +
        '<div class="owner"><span class="dot ' + (i.online?'on':'off') + '"></span>' + onlineTxt +
          (i.owner ? ' · 负责人 ' + esc(i.owner) : '') + '</div>' +
      '</div>' +
    '</div>' +
    (i.description ? '<div class="desc">' + esc(i.description) + '</div>' : '') +
    (tags ? '<div class="tags">' + tags + '</div>' : '') +
    (work ? '<div><div class="section-title">正在进行</div><div class="work">' + work + '</div></div>' : '') +
    (done ? '<div><div class="section-title">历史完成</div><div class="done">' + done + '</div></div>' : '') +
  '</article>';
}

function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' });
  return d.toLocaleDateString('zh-CN', { month:'2-digit', day:'2-digit' });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

document.addEventListener('DOMContentLoaded', init);
</script>
</body>
</html>
`
