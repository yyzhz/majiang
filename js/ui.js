// ============================================================================
// 界面渲染：座位头像、牌河、副露、手牌、听牌面板、操作按钮、日志
// 座位映射（以玩家视角）：0 下 1 右 2 上 3 左
// ============================================================================
import { tileHTML, backHTML, meldHTML } from './tiles.js';
import { tileName } from './mahjong.js';

export const SEAT_DIRS = ['bottom', 'right', 'top', 'left'];

// 四家各占一面：本家在下方，上家占右侧，对家占上方，下家占左侧
// （与逆时针出牌顺序 0 -> 1 -> 2 -> 3 一致，牌桌为四面环绕）
const DIR_OF_PID = { 0: 'bottom', 1: 'right', 2: 'top', 3: 'left' };

/** 真人碰/杠决策剩余秒数（向上取整） */
function claimSeconds(game) {
  const remain = game.claimRemaining != null ? game.claimRemaining : game.claimDeadline - Date.now();
  return Math.max(0, Math.ceil(remain / 1000));
}

function headHTML(game, pid, meta) {
  const p = game.players[pid];
  const isActive = game.turn === pid && game.phase !== 'over';
  const cls = ['seat-head', isActive ? 'is-active' : '', isActive && p.isAI ? 'is-thinking' : '']
    .filter(Boolean)
    .join(' ');
  const isDealer = pid === game.dealer;
  const score = game.scores[pid];
  const scoreCls = score > 0 ? 'is-plus' : score < 0 ? 'is-minus' : '';
  const flow = p.river.length;
  const stateText = isActive ? (game.phase === 'draw' ? '摸牌中' : '行牌中') : p.melds.length > 0 ? `副露 ${p.melds.length}` : '门前清';

  return `<div id="head-${DIR_OF_PID[pid]}" class="${cls}" data-pid="${pid}">
    <span class="avatar">${meta.avatars[pid]}</span>
    <div class="head-main">
      <div class="head-row">
        <span class="wind">${p.wind}</span>
        <span class="name">${meta.names[pid]}</span>
        ${isDealer ? '<span class="tag-dealer">庄</span>' : ''}
      </div>
      <div class="head-row head-sub">
        <span class="meta">${stateText}</span>
        <span class="meta">牌河 ${flow}</span>
        <span class="score ${scoreCls}">积分 ${score > 0 ? '+' : ''}${score}</span>
      </div>
    </div>
  </div>`;
}

function riverHTML(game, pid) {
  const p = game.players[pid];
  const isLastOwner = game.lastDiscard && game.lastDiscard.pid === pid;
  const claimTile = game.pendingClaim ? game.pendingClaim.tile : null;
  const canRespond =
    claimTile != null &&
    game.players[0].hand.includes(claimTile) &&
    (game.pendingClaim.options || []).length > 0;
  return p.river
    .map((t, i) => {
      const isLast = isLastOwner && i === p.river.length - 1;
      const isClaiming = isLast && canRespond;
      return tileHTML(t, {
        className: 'tile--mini',
        extraClass: isLast ? (isClaiming ? 'tile--last tile--last-claim' : 'tile--last') : '',
        title: `${tileName(t)}${isLast ? (isClaiming ? '（可碰/杠这张）' : '（最近打出）') : ''}`
      });
    })
    .join('');
}

function meldsHTML(game, pid) {
  const p = game.players[pid];
  if (p.melds.length === 0) return '';
  return p.melds.map((m) => meldHTML(m, { mini: true })).join('');
}

/** 对手手牌：只显示牌背（张数真实反映手牌 + 副露折算），摸牌时与手牌间留空隙 */
function oppHandHTML(game, pid) {
  const p = game.players[pid];
  const count = p.hand.length;
  if (count <= 0) return '';
  const isDrawing = game.phase === 'discard' && game.turn === pid && game.drawnTile != null;
  if (isDrawing && count >= 2) {
    return `${backHTML(count - 1, 'tile--tiny')}<div class="drawn-gap"></div>${backHTML(1, 'tile--tiny')}`;
  }
  return backHTML(count, 'tile--tiny');
}

function myHandHTML(game) {
  const p = game.players[0];
  const isMyTurn = game.phase === 'discard' && game.turn === 0;
  const hand = p.hand.slice().sort((a, b) => a - b);

  // 能否用某张手牌响应别人打出的牌：统计手牌里该牌张数
  const claimTile = game.pendingClaim ? game.pendingClaim.tile : null;
  const opts = (game.pendingClaim && game.pendingClaim.options) || [];
  let claimTip = '';
  if (claimTile != null) {
    if (opts.includes('gang')) claimTip = '杠';
    else if (opts.includes('peng')) claimTip = '碰';
  }
  const countOfClaim = claimTile != null ? p.hand.filter((t) => t === claimTile).length : 0;
  const canHighlight = claimTile != null && countOfClaim > 0 && claimTip !== '';

  // 刚摸到的牌放在最右侧单独展示
  let main = hand;
  let drawnTile = null;
  if (isMyTurn && game.drawnTile != null && hand.includes(game.drawnTile)) {
    const rest = hand.slice();
    rest.splice(rest.indexOf(game.drawnTile), 1);
    main = rest;
    drawnTile = game.drawnTile;
  }

  const suggestSet =
    isMyTurn && Array.isArray(game.suggestTiles) && game.suggestTiles.length > 0
      ? new Set(game.suggestTiles)
      : null;
  const tileEls = main
    .map((t) => {
      const hit = canHighlight && t === claimTile;
      const isSuggest = suggestSet ? suggestSet.has(t) : false;
      return tileHTML(t, {
        className: isMyTurn ? 'tile--playable' : 'tile--lock',
        extraClass: [hit ? 'tile--claimable' : '', isSuggest ? 'tile--suggest' : ''].filter(Boolean).join(' '),
        badge: hit && claimTip ? claimTip : isSuggest ? '荐' : '',
        title: `${tileName(t)}${
          isSuggest ? '（建议打出）' : hit ? `（可${claimTip}）` : isMyTurn ? '（点击打出）' : ''
        }`
      });
    })
    .join('');

  const drawnHit = canHighlight && drawnTile === claimTile;
  const drawnSuggest = drawnTile != null && suggestSet != null && suggestSet.has(drawnTile);
  const drawnEl =
    drawnTile != null
      ? `<div class="drawn-gap"></div>${tileHTML(drawnTile, {
          className: isMyTurn ? 'tile--playable tile--drawn' : 'tile--lock tile--drawn',
          extraClass: [drawnHit ? 'tile--claimable' : '', drawnSuggest ? 'tile--suggest' : ''].filter(Boolean).join(' '),
          badge: drawnHit && claimTip ? claimTip : drawnSuggest ? '荐' : '',
          title: `${tileName(drawnTile)}${drawnSuggest ? '（建议打出）' : drawnHit ? `（可${claimTip}）` : isMyTurn ? '（刚摸到，点击打出）' : ''}`
        })}`
      : '';

  let waitEl = '';
  if (!isMyTurn && (game.phase === 'draw' || game.phase === 'claim')) {
    const need = 13 - p.hand.length - p.melds.length * 3;
    if (need > 0) waitEl = `<div class="hand-wait">${backHTML(Math.min(need, 3), 'tile--mini')}</div>`;
  }

  return `${waitEl}${tileEls}${drawnEl}`;
}

function listenPanelHTML(game) {
  const p = game.players[0];
  if (game.phase === 'over') {
    return '<div class="panel-tip">本局已结束，点击「下一局」继续。</div>';
  }
  const total = p.hand.length + p.melds.length * 3;
  if (total % 3 !== 2) {
    return '<div class="panel-tip">摸牌后将自动分析听牌情况。</div>';
  }
  const list = game.handListenTiles(0);
  if (list.length === 0) {
    return '<div class="panel-tip">当前打哪张都不听牌，继续调整牌型。</div>';
  }
  const rows = list
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
  return `<div class="listen-head">打牌后听牌方案</div>${rows}`;
}

function scoreboardHTML(game, meta) {
  return [0, 1, 2, 3]
    .map((pid) => {
      const p = game.players[pid];
      const s = game.scores[pid];
      const sCls = s > 0 ? 'is-plus' : s < 0 ? 'is-minus' : '';
      const active = game.turn === pid && game.phase !== 'over';
      return `<div class="score-card ${pid === 0 ? 'is-me' : ''} ${active ? 'is-active' : ''}">
        <div class="score-row">
          <span class="score-who"><b>${p.wind}</b> ${meta.names[pid]}</span>
          <span class="score-val ${sCls}">${s > 0 ? '+' : ''}${s}</span>
        </div>
        <div class="score-tags">${meta.tags[pid]}</div>
      </div>`;
    })
    .join('');
}

function logHTML(game) {
  return game.logs
    .map((l) => {
      const time = new Date(l.t).toLocaleTimeString('zh-CN', { hour12: false }).slice(3, 8);
      return `<div class="log-item ${l.hot ? 'is-hot' : ''}">
        <span class="log-time">${time}</span>
        <span class="log-who">${l.who}</span>
        <span class="log-text">${l.text}</span>
      </div>`;
    })
    .join('');
}

export function renderGame(game, refs, meta) {
  for (const pid of [0, 1, 2, 3]) {
    const dir = DIR_OF_PID[pid];
    const headEl = document.getElementById(`head-${dir}`);
    if (headEl) headEl.outerHTML = headHTML(game, pid, meta);
    const riverEl = document.getElementById(`river-${dir}`);
    if (riverEl) riverEl.innerHTML = riverHTML(game, pid);
    const meldEl = document.getElementById(`melds-${dir}`);
    if (meldEl) meldEl.innerHTML = meldsHTML(game, pid);
    const handEl = document.getElementById(`hand-${dir}`);
    if (handEl) handEl.innerHTML = pid === 0 ? '' : oppHandHTML(game, pid);
    const seatEl = document.getElementById(`seat-${dir}`);
    const p = game.players[pid];
    if (seatEl) {
      seatEl.classList.toggle('is-current', game.turn === pid && game.phase !== 'over');
      seatEl.classList.toggle('is-last', !!game.lastDiscard && game.lastDiscard.pid === pid);
    }
  }

  if (refs.myHand) {
    const claimTile = game.pendingClaim ? game.pendingClaim.tile : null;
    const claimOpts = (game.pendingClaim && game.pendingClaim.options) || [];
    const hasClaim =
      claimTile != null &&
      claimOpts.length > 0 &&
      game.players[0].hand.includes(claimTile);
    refs.myHand.innerHTML = myHandHTML(game);
    refs.myHand.classList.toggle('is-my-turn', game.phase === 'discard' && game.turn === 0);
    refs.myHand.classList.toggle('is-claimable', hasClaim);
  }

  const me = game.players[0];
  if (refs.wallCount) refs.wallCount.textContent = game.wall.length;
  if (refs.centerWall) refs.centerWall.textContent = game.wall.length;
  if (refs.round) refs.round.textContent = game.round;
  if (refs.score) refs.score.textContent = game.scores[0];
  if (refs.zimo) refs.zimo.textContent = game.zimoCount;
  if (refs.handCount)
    refs.handCount.textContent = me.hand.length + me.melds.length * 3;

  if (refs.windBadge) {
    const current = game.players[game.turn];
    refs.windBadge.textContent = game.phase === 'over' ? '本局结束' : `${current.wind}家风`;
    refs.windBadge.dataset.wind = game.phase === 'over' ? '' : current.wind;
  }

  if (refs.scoreboard) refs.scoreboard.innerHTML = scoreboardHTML(game, meta);
  if (refs.logs) refs.logs.innerHTML = logHTML(game);
  if (refs.listen) refs.listen.innerHTML = listenPanelHTML(game);
}

export function renderActions(game, refs, meta) {
  const acts = game.humanActions();
  const btn = (act) => (refs.actionButtons || []).find((b) => b.dataset.act === act);
  const set = (act, disabled, text, visible = true) => {
    const b = btn(act);
    if (!b) return;
    b.disabled = !!disabled;
    b.classList.toggle('is-hidden', !visible);
    if (text) b.textContent = text;
  };

  const secs = game.pendingClaim ? claimSeconds(game) : 0;

  set('zimo', !acts.canZimo, '自摸胡', acts.canZimo);
  set('peng', !acts.canPeng, acts.canPeng && secs > 0 ? `碰·${secs}s` : '碰', acts.canPeng);
  set('gang', !acts.canGang, acts.canGang && secs > 0 ? `杠·${secs}s` : '杠', acts.canGang);
  set('pass', !acts.canPass, '过', acts.canPass);

  let hint = '';
  if (game.phase === 'ready') {
    hint = '牌已码好，点击「开始摸牌」或按空格开局';
  } else if (game.phase === 'over') {
    hint = game.winInfo && game.winInfo.draw ? '牌墙摸完，本局流局' : '本局结束，点击「下一局」继续';
  } else if (game.phase === 'draw') {
    hint =
      game.turn === 0
        ? '正在为你摸牌…'
        : `${game.players[game.turn].wind}家 ${meta.names[game.turn]} 正在摸牌…`;
  } else if (game.phase === 'discard') {
    if (game.turn === 0) {
      hint = acts.canZimo ? '手牌已成胡型，点击「自摸胡」' : '点击一张手牌打出';
    } else {
      hint = `${game.players[game.turn].wind}家 ${meta.names[game.turn]} 正在思考…`;
    }
  } else if (game.phase === 'claim') {
    if (game.pendingClaim) {
      const secs = claimSeconds(game);
      hint = `${meta.names[game.pendingClaim.from]} 打出 ${tileName(game.pendingClaim.tile)}，你可以碰或杠（还剩 ${secs} 秒，超时自动过）`;
    } else {
      hint = '其他家正在响应这张牌…';
    }
  }
  if (refs.hint) refs.hint.textContent = hint;

  if (refs.newRoundBtn) {
    refs.newRoundBtn.disabled = game.phase !== 'over';
    // 「下一局」仅在本局结束后出现，平时不占手牌区位置
    refs.newRoundBtn.classList.toggle('is-hidden', game.phase !== 'over');
  }
  if (refs.readyMask) refs.readyMask.classList.toggle('is-hidden', game.phase !== 'ready');
}

let toastTimer = null;
export function toast(layer, text, duration = 1300) {
  if (!layer) return;
  layer.innerHTML = `<div class="toast">${text}</div>`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    layer.innerHTML = '';
  }, duration);
}
