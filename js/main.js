// ============================================================================
// 主入口：装配游戏实例、渲染、交互与音效
// ============================================================================
import { MahjongGame, PLAYER_NAMES, PLAYER_AVATAR, PLAYER_TAG } from './game.js';
import { renderGame, renderActions, toast } from './ui.js';
import { tileHTML, meldHTML } from './tiles.js';
import { tileName } from './mahjong.js';
import { bestDiscardSuggestion } from './ai.js';
import { sounds, setSoundEnabled, isSoundEnabled } from './sound.js';

const meta = { names: PLAYER_NAMES, avatars: PLAYER_AVATAR, tags: PLAYER_TAG };

const refs = {
  myHand: document.getElementById('my-hand'),
  myMelds: document.getElementById('melds-bottom'),
  handCount: document.getElementById('my-hand-count'),
  wallCount: document.getElementById('hud-wall'),
  round: document.getElementById('hud-round'),
  score: document.getElementById('hud-score'),
  zimo: document.getElementById('hud-zimo'),
  centerWall: document.getElementById('center-wall-count'),
  windBadge: document.getElementById('center-dice'),
  scoreboard: document.getElementById('scoreboard'),
  logs: document.getElementById('log-list'),
  listen: document.getElementById('listen-box'),
  hint: document.getElementById('hint-text'),
  actionButtons: Array.from(document.querySelectorAll('#action-buttons .btn-action, .action-bar .btn-action')),
  newRoundBtn: document.getElementById('btn-newround'),
  readyMask: document.getElementById('ready-mask'),
  toastLayer: document.getElementById('toast-layer')
};

const game = new MahjongGame();
// 调试用：浏览器控制台可通过 window.__game 访问对局状态
window.__game = game;

let lastPhase = '';
let lastLogCount = 0;
let lastLogStamp = -1;
let hoverPreview = null;

function refresh() {
  // 建议高亮只在「轮到我出牌」期间有效，其余时刻自动清除
  if (!(game.phase === 'discard' && game.turn === 0)) game.suggestTiles = null;
  renderGame(game, refs, meta);
  renderActions(game, refs, meta);
  handleSound();
  if (hoverPreview != null && game.phase === 'discard' && game.turn === 0) renderListenHint();
}

// ---------- 最优出牌提示 ----------
function requestHint() {
  if (game.phase !== 'discard' || game.turn !== 0) {
    toast(refs.toastLayer, '现在轮不到你出牌，无法提示', 1300);
    return;
  }
  sounds.click();
  const p = game.players[0];
  if (game.canSelfWin(0)) {
    game.log('提示', '手牌已成胡型，建议点击「自摸胡」', true);
    game.suggestTiles = null;
    refresh();
    toast(refs.toastLayer, '已成胡型！点击「自摸胡」结算', 1800);
    return;
  }
  const sug = bestDiscardSuggestion(p.hand, p.melds.length, game.visibleCounts(0));
  game.suggestTiles = [sug.tile, ...(sug.alts || []).map((a) => a.tile)];
  game.log('提示', `建议打 ${tileName(sug.tile)}：${sug.reason}`, true);
  refresh();
  toast(
    refs.toastLayer,
    sug.alts && sug.alts.length > 0
      ? `建议打 ${tileName(sug.tile)}（有并列），原因见「记录」`
      : `建议打 ${tileName(sug.tile)}，原因见「记录」`,
    2200
  );
}

document.getElementById('btn-hint').addEventListener('click', requestHint);

function handleSound() {
  const latest = game.logs[0];
  if (latest && latest.t !== lastLogStamp) {
    lastLogStamp = latest.t;
    if (/自摸胡牌/.test(latest.text)) sounds.win();
    else if (/杠/.test(latest.text)) sounds.gang();
    else if (/碰 /.test(latest.text)) sounds.peng();
    else if (/摸牌|补牌/.test(latest.text)) sounds.draw();
    else if (/打出/.test(latest.text)) sounds.discard();
  }
  lastLogCount = game.logs.length;

  if (game.phase === 'over' && lastPhase !== 'over') {
    if (game.winInfo && game.winInfo.draw) sounds.drawRound();
    setTimeout(openResult, 480);
  }
  lastPhase = game.phase;
}

game.onChange(refresh);

// ---------- 结算弹窗 ----------
const resultModal = document.getElementById('result-modal');

function openResult() {
  const info = game.winInfo;
  if (!info) return;
  const titleEl = document.getElementById('result-title');
  const subEl = document.getElementById('result-sub');
  const tilesEl = document.getElementById('result-tiles');
  const scoresEl = document.getElementById('result-scores');

  if (info.draw) {
    titleEl.textContent = '流 局';
    subEl.textContent = '牌墙已摸完，无人自摸，本局不计分。';
    tilesEl.innerHTML = '';
  } else {
    titleEl.textContent = info.pid === 0 ? '自 摸' : '他 家 自 摸';
    const fanText = info.fan.fans.map((f) => `${f.name} ${f.fan} 番`).join(' + ');
    subEl.innerHTML = `${meta.names[info.pid]} 自摸${info.gangKai ? '（杠上开花）' : ''}<br />${fanText} = 共 ${info.fan.total} 番 · 底分 2 · 实收 ${info.delta} 分`;
    const meldStr = info.melds.map((m) => meldHTML(m, { mini: true, lastTile: m.from != null ? 3 : -1 })).join('');
    const sortedHand = info.hand.slice().sort((a, b) => a - b);
    const handStr = sortedHand
      .map((t) => tileHTML(t, { className: 'tile--mini', title: tileName(t) }))
      .join('');
    tilesEl.innerHTML = `${meldStr}${handStr}`;
  }

  scoresEl.innerHTML = [0, 1, 2, 3]
    .map((pid) => {
      const s = game.scores[pid];
      const cls = s > 0 ? 'is-plus' : s < 0 ? 'is-minus' : '';
      return `<div class="score-card ${pid === 0 ? 'is-me' : ''}">
        <div class="score-row">
          <span class="score-who"><b>${game.players[pid].wind}</b> ${meta.names[pid]}</span>
          <span class="score-val ${cls}">${s > 0 ? '+' : ''}${s}</span>
        </div>
      </div>`;
    })
    .join('');

  resultModal.classList.remove('hidden');
}

document.getElementById('result-next').addEventListener('click', () => {
  resultModal.classList.add('hidden');
  game.nextRound();
  refresh();
});

document.getElementById('result-close').addEventListener('click', () => {
  resultModal.classList.add('hidden');
});

// ---------- 操作按钮 ----------
refs.actionButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    sounds.click();
    const act = btn.dataset.act;
    if (act === 'zimo') {
      game.humanZimo();
    } else if (act === 'peng') {
      game.humanPeng();
    } else if (act === 'gang') {
      const acts = game.humanActions();
      if (acts.claimTile != null) {
        game.humanGangClaim();
      } else if (acts.gangOptions.length > 0) {
        const opt = acts.gangOptions[0];
        game.humanGangSelf(opt.kind, opt.tile);
      }
    } else if (act === 'pass') {
      game.humanPass();
    }
    refresh();
  });
});

document.getElementById('btn-start').addEventListener('click', () => {
  sounds.click();
  game.start();
  refresh();
  toast(refs.toastLayer, '开局！祝你自摸', 1400);
});

refs.newRoundBtn.addEventListener('click', () => {
  if (game.phase !== 'over') return;
  game.nextRound();
  refresh();
});

// ---------- 手牌交互 ----------
// 注意：切不可在 mouseover/mouseout 中整体重渲染手牌区，
// 否则牌元素会被替换，导致 mousedown 与 mouseup 落在不同元素上，click 永远不会触发。
function renderListenHint() {
  if (!refs.listen) return;
  if (hoverPreview == null) return;
  if (game.phase !== 'discard' || game.turn !== 0) return;
  const map = game.handListenTiles(0).find((m) => m.discard === hoverPreview);
  if (map) {
    refs.listen.innerHTML = `<div class="listen-head">若打 ${tileName(hoverPreview)}</div>
      <div class="listen-row"><span class="listen-wait">听 ${map.waits.map((w) => tileName(w)).join('、')}</span>
      <span class="listen-count">${map.waits.length} 门</span></div>`;
  }
}

function clearListenHint() {
  if (!refs.listen) return;
  hoverPreview = null;
  renderListenPanelOnly();
}

function renderListenPanelOnly() {
  if (!refs.listen) return; // 听牌抽屉已移除，悬浮提示不再渲染
  const total = game.players[0].hand.length + game.players[0].melds.length * 3;
  if (game.phase === 'over') {
    refs.listen.innerHTML = '<div class="panel-tip">本局已结束，点击「下一局」继续。</div>';
    return;
  }
  if (total % 3 !== 2) {
    refs.listen.innerHTML = '<div class="panel-tip">摸牌后将自动分析听牌情况。</div>';
    return;
  }
  const list = game.handListenTiles(0);
  if (list.length === 0) {
    refs.listen.innerHTML = '<div class="panel-tip">当前打哪张都不听牌，继续调整牌型。</div>';
    return;
  }
  refs.listen.innerHTML =
    '<div class="listen-head">打牌后听牌方案</div>' +
    list
      .slice(0, 6)
      .map(
        (m) => `<div class="listen-row">
          <span class="listen-out">打 ${tileName(m.discard)}</span>
          <span class="listen-arrow">→</span>
          <span class="listen-wait">听 ${m.waits.map((w) => tileName(w)).join('、')}</span>
          <span class="listen-count">${m.waits.length} 门</span>
        </div>`
      )
      .join('');
}

/** 用事件委托绑定到文档，避免容器被重渲染后丢失监听 */
document.addEventListener('click', (e) => {
  const el = e.target.closest('#my-hand .tile');
  if (!el) return;
  if (game.phase !== 'discard' || game.turn !== 0) {
    toast(refs.toastLayer, '还没轮到你出牌', 1100);
    return;
  }
  const tile = Number(el.dataset.tile);
  if (Number.isNaN(tile)) return;
  if (game.playerDiscard(0, tile)) {
    sounds.discard();
    hoverPreview = null;
    refresh();
  }
});

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest && e.target.closest('#my-hand .tile');
  if (!el) return;
  if (game.phase !== 'discard' || game.turn !== 0) return;
  const tile = Number(el.dataset.tile);
  if (Number.isNaN(tile) || tile === hoverPreview) return;
  hoverPreview = tile;
  renderListenHint();
});

document.addEventListener('mouseout', (e) => {
  const from = e.target.closest && e.target.closest('#my-hand .tile');
  if (!from) return;
  const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('#my-hand') : null;
  if (!to) clearListenHint();
});

// ---------- 键盘 ----------
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea') return;

  if (e.key === 'Escape' && openDrawer) {
    setDrawer(null);
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (game.phase === 'ready') game.start();
    else if (game.phase === 'draw' && game.turn === 0) game.drawTile(0);
    else if (game.phase === 'discard' && game.turn === 0 && game.canSelfWin(0)) game.humanZimo();
    refresh();
    return;
  }
  if (e.key === 'h' || e.key === 'H') {
    requestHint();
    return;
  }
  const acts = game.humanActions();
  if (e.key === 'p' || e.key === 'P') {
    if (acts.canPeng) {
      game.humanPeng();
      refresh();
    }
  } else if (e.key === 'g' || e.key === 'G') {
    if (acts.canGang) {
      if (acts.claimTile != null) game.humanGangClaim();
      else if (acts.gangOptions.length > 0) game.humanGangSelf(acts.gangOptions[0].kind, acts.gangOptions[0].tile);
      refresh();
    }
  } else if (e.key === 'Escape') {
    if (acts.canPass) {
      game.humanPass();
      refresh();
    }
  }
});

// ---------- 浮窗抽屉（积分榜 / 听牌 / 记录） ----------
const drawerMask = document.getElementById('drawer-mask');
const drawerButtons = Array.from(document.querySelectorAll('.btn-drawer'));
const drawers = {
  score: document.getElementById('drawer-score'),
  listen: document.getElementById('drawer-listen'),
  log: document.getElementById('drawer-log')
};
let openDrawer = null;

function setDrawer(name) {
  const next = openDrawer === name ? null : name;
  openDrawer = next;
  Object.entries(drawers).forEach(([key, el]) => {
    if (!el) return;
    const on = key === next;
    el.classList.toggle('is-open', on);
    if (on) el.setAttribute('aria-hidden', 'false');
    else el.setAttribute('aria-hidden', 'true');
  });
  drawerButtons.forEach((b) => b.classList.toggle('is-active', b.dataset.drawer === next));
  if (drawerMask) drawerMask.classList.toggle('is-open', !!next);
  if (next === 'listen') {
    hoverPreview = null;
    renderListenPanelOnly();
  }
  if (next && sounds && sounds.click) sounds.click();
}

drawerButtons.forEach((b) => {
  b.addEventListener('click', () => setDrawer(b.dataset.drawer));
});
if (drawerMask) drawerMask.addEventListener('click', () => setDrawer(null));
document.querySelectorAll('[data-drawer-close]').forEach((b) => {
  b.addEventListener('click', () => setDrawer(null));
});

// ---------- 规则弹窗 ----------
const ruleModal = document.getElementById('rule-modal');
document.getElementById('btn-rule').addEventListener('click', () => ruleModal.classList.remove('hidden'));
ruleModal.addEventListener('click', (e) => {
  if (e.target === ruleModal || e.target.dataset.close === '1') ruleModal.classList.add('hidden');
});

// ---------- 音效开关 ----------
const soundBtn = document.getElementById('btn-sound');
soundBtn.addEventListener('click', () => {
  const next = !isSoundEnabled();
  setSoundEnabled(next);
  soundBtn.textContent = `音效：${next ? '开' : '关'}`;
  if (next) sounds.click();
});

// ---------- 重新开局 ----------
document.getElementById('btn-restart').addEventListener('click', () => {
  resultModal.classList.add('hidden');
  game.restart();
  refresh();
  toast(refs.toastLayer, '重新开局，积分已清零', 1300);
});

// ---------- 启动 ----------
refresh();
toast(refs.toastLayer, '点击「开始摸牌」开局', 1700);

// ---------- Android 物理返回键 ----------
// MainActivity 通过 evaluateJavascript 调用本函数；返回 true 表示页面已消费该次返回。
window.__onAndroidBack = () => {
  if (resultModal && !resultModal.classList.contains('hidden')) {
    resultModal.classList.add('hidden');
    return true;
  }
  if (ruleModal && !ruleModal.classList.contains('hidden')) {
    ruleModal.classList.add('hidden');
    return true;
  }
  if (openDrawer) {
    setDrawer(null);
    return true;
  }
  return false;
};

// ---------- AI 强度 ----------
const LEVEL_NAMES = { easy: '简单', normal: '普通', hard: '困难' };
const LEVEL_ORDER = ['easy', 'normal', 'hard'];

function loadLevel() {
  try {
    const v = localStorage.getItem('mj-ai-level');
    return LEVEL_NAMES[v] ? v : 'normal';
  } catch {
    return 'normal';
  }
}

function applyLevel(level, silent = false) {
  if (!LEVEL_NAMES[level]) return;
  game.setAILevel(level);
  try {
    localStorage.setItem('mj-ai-level', level);
  } catch {
    /* 存储不可用时忽略 */
  }
  const btn = document.getElementById('btn-level');
  if (btn) btn.textContent = `难度：${LEVEL_NAMES[level]}`;
  document.querySelectorAll('.diff-btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.level === level);
  });
  if (!silent) toast(refs.toastLayer, `AI 强度已切换为「${LEVEL_NAMES[level]}」`, 1400);
}

document.getElementById('btn-level').addEventListener('click', () => {
  const next = LEVEL_ORDER[(LEVEL_ORDER.indexOf(game.aiLevel) + 1) % LEVEL_ORDER.length];
  sounds.click();
  applyLevel(next);
});

document.querySelectorAll('.diff-btn').forEach((b) => {
  b.addEventListener('click', () => {
    if (!LEVEL_NAMES[b.dataset.level]) return;
    sounds.click();
    applyLevel(b.dataset.level);
  });
});

// 启动时恢复上次选择的 AI 强度
applyLevel(loadLevel(), true);
