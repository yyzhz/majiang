// ============================================================================
// 对局状态机：发牌、摸牌、打出、碰、杠（明杠/暗杠/补杠）、自摸结算、流局
// 核心规则：只能自摸胡；打出与杠出的牌都不能被他人胡（不设点炮、不设抢杠胡）
// ============================================================================
import {
  buildWall,
  shuffle,
  sortTiles,
  canWinHand,
  waitingTiles,
  evaluateFan,
  scoreOf,
  countMap,
  isWild,
  tileName,
  TILE_TOTAL
} from './mahjong.js';
import { aiAfterDraw, aiClaimOptions, aiClaim, aiDiscard } from './ai.js';

export const PLAYER_NAMES = ['你', '上家·阿竹', '对家·老陈', '下家·小满'];
export const PLAYER_AVATAR = ['我', '竹', '陈', '满'];
export const PLAYER_TAG = ['本家 · 手动操作', '稳健型 AI', '激进型 AI', '均衡型 AI'];
export const WINDS = ['东', '南', '西', '北'];

/** 玩家下标 0 是真人，逆时针顺序：0 -> 1 -> 2 -> 3 -> 0 */
export const NEXT_SEAT = (pid) => (pid + 1) % 4;

/** 真人碰/杠决策倒计时时长（毫秒） */
export const CLAIM_TIMEOUT = 12000;

export class MahjongGame {
  constructor() {
    this.listeners = [];
    this.aiLevel = 'normal';
    this.round = 1;
    this.dealer = 0;
    this.scores = [0, 0, 0, 0];
    this.zimoCount = 0;
    this.timers = [];
    this.claimTicker = null;
    this.setupRound(true);
  }

  // ---------- 基础 ----------
  onChange(fn) {
    this.listeners.push(fn);
  }

  setAILevel(level) {
    if (this.aiLevel === level) return;
    this.aiLevel = level;
    this.emit();
  }

  emit() {
    for (const fn of this.listeners) {
      try {
        fn(this);
      } catch (err) {
        // 渲染层异常不影响牌局推进
        console.error('[render]', err);
      }
    }
  }

  clearTimers() {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    this.stopClaimTicker();
  }

  // 真人碰/杠倒计时：每秒刷新剩余时间并通知界面
  startClaimTicker() {
    this.stopClaimTicker();
    this.claimTicker = setInterval(() => {
      if (this.phase !== 'claim' || !this.pendingClaim) {
        this.stopClaimTicker();
        return;
      }
      const remain = Math.max(0, this.claimDeadline - Date.now());
      if (remain <= 0) {
        this.stopClaimTicker();
        return;
      }
      this.claimRemaining = remain;
      this.emit();
    }, 1000);
  }

  stopClaimTicker() {
    if (this.claimTicker) clearInterval(this.claimTicker);
    this.claimTicker = null;
  }

  delay(fn, ms) {
    const id = setTimeout(() => {
      this.timers = this.timers.filter((x) => x !== id);
      fn();
    }, ms);
    this.timers.push(id);
    return id;
  }

  log(who, text, hot = false) {
    this.logs.unshift({ who, text, hot, t: Date.now() });
    if (this.logs.length > 80) this.logs.pop();
  }

  // ---------- 开局 ----------
  setupRound(initial = false) {
    this.clearTimers();
    const wall = shuffle(buildWall());
    this.wall = wall;
    this.players = [0, 1, 2, 3].map((pid) => ({
      pid,
      hand: sortTiles(wall.splice(wall.length - 13, 13)),
      melds: [],
      river: [],
      wind: WINDS[(pid - this.dealer + 4) % 4],
      isAI: pid !== 0
    }));

    this.turn = this.dealer;
    this.phase = 'ready'; // ready | draw | discard | claim | over
    this.drawnTile = null;
    this.lastDiscard = null;
    this.lastDrawnWasGang = false;
    this.pendingClaim = null;
    this.claimResponders = [];
    this.claimDeadline = 0;
    this.claimRemaining = null;
    this.winInfo = null;
    this.logs = [];
    this.gangFlag = false;

    this.log('系统', `第 ${this.round} 局开始，${PLAYER_NAMES[this.dealer]} 坐庄，共 ${TILE_TOTAL} 张牌`, true);
    this.log('系统', '本局只能自摸胡，不能点炮、不能抢杠胡');

    if (initial) this.dealerDrawPending = true;
    this.emit();
  }

  start() {
    if (this.phase !== 'ready') return;
    this.beginDraw(this.dealer);
  }

  nextRound() {
    this.round += 1;
    this.dealer = (this.dealer + 1) % 4;
    this.setupRound();
    this.start(); // 直接进入下一局，不再弹「开始摸牌」遮罩
  }

  restart() {
    this.round = 1;
    this.dealer = 0;
    this.scores = [0, 0, 0, 0];
    this.zimoCount = 0;
    this.setupRound();
    this.start();
  }

  // ---------- 摸牌 ----------
  beginDraw(pid) {
    if (this.wall.length === 0) {
      this.finishDrawGame();
      return;
    }
    this.turn = pid;
    this.phase = 'draw';
    this.emit();

    // 四家统一自动摸牌：玩家不再需要手动点击「摸牌」
    this.delay(() => this.drawTile(pid), pid === 0 ? 220 : 360 + Math.random() * 240);
  }

  drawTile(pid) {
    if (this.phase !== 'draw' || this.turn !== pid) return false;
    if (this.wall.length === 0) {
      this.finishDrawGame();
      return false;
    }
    const tile = this.wall.pop();
    const p = this.players[pid];
    p.hand.push(tile);
    this.drawnTile = tile;
    this.phase = 'discard';
    this.log(PLAYER_NAMES[pid], `摸牌${pid === 0 ? ` ${tileName(tile)}` : ''}`);

    // 自摸检测
    if (canWinHand(p.hand, p.melds.length)) {
      if (pid === 0) {
        this.log('系统', '手牌已成胡型，可点击「自摸胡」', true);
        this.emit();
        return true;
      }
      this.delay(() => this.aiTurn(pid), 520);
      this.emit();
      return true;
    }

    if (pid !== 0) {
      this.delay(() => this.aiTurn(pid), 460 + Math.random() * 420);
    }
    this.emit();
    return true;
  }

  // ---------- AI 回合 ----------
  aiTurn(pid) {
    if (this.phase !== 'discard' || this.turn !== pid) return;
    const p = this.players[pid];
    const visible = this.visibleCounts(pid);
    const decision = aiAfterDraw(p, visible, this.aiLevel);

    if (decision.action === 'zimo') {
      this.declareZimo(pid);
      return;
    }
    if (decision.action === 'gang') {
      this.doGang(pid, decision.kind, decision.tile);
      return;
    }
    this.discard(pid, decision.tile);
  }

  // ---------- 出牌 ----------
  playerDiscard(pid, tile) {
    if (this.phase !== 'discard' || this.turn !== pid) return false;
    const p = this.players[pid];
    if (!p.hand.includes(tile)) return false;
    this.discard(pid, tile);
    return true;
  }

  discard(pid, tile) {
    const p = this.players[pid];
    const idx = p.hand.indexOf(tile);
    if (idx < 0) return;
    p.hand.splice(idx, 1);
    p.river.push(tile);
    this.lastDiscard = { pid, tile };
    this.drawnTile = null;
    this.gangFlag = false;
    this.log(PLAYER_NAMES[pid], `打出 ${tileName(tile)}`);
    this.phase = 'claim';
    this.pendingClaim = null;
    this.claimResponders = [];
    this.emit();

    // 依次询问其他三家是否能碰/杠（本规则不能胡别人的牌）
    const candidates = [];
    for (let i = 1; i <= 3; i++) {
      const other = (pid + i) % 4;
      if (other === 0) continue; // 真人单独处理
      const opts = aiClaimOptions(this.players[other], tile);
      if (opts.length > 0) candidates.push({ pid: other, opts });
    }
    this.claimResponders = candidates;

    // 真人可以碰/杠时，给 CLAIM_TIMEOUT 决策时间并显示倒计时
    const humanOpts = pid === 0 ? [] : aiClaimOptions(this.players[0], tile);
    if (humanOpts.length > 0) {
      this.pendingClaim = { from: pid, tile, options: humanOpts };
      this.claimDeadline = Date.now() + CLAIM_TIMEOUT;
      this.claimRemaining = CLAIM_TIMEOUT;
      this.claimHumanTimer = this.delay(() => {
        if (this.phase === 'claim' && this.pendingClaim) this.humanPass();
      }, CLAIM_TIMEOUT);
      this.startClaimTicker();
      this.emit();
      return;
    }

    if (candidates.length === 0) {
      this.delay(() => this.beginDraw(NEXT_SEAT(pid)), 320);
      return;
    }
    this.delay(() => this.settleClaim(), 240);
  }

  // 处理 AI 的碰杠响应
  settleClaim() {
    if (this.phase !== 'claim') return;
    const responders = this.claimResponders || [];
    const tile = this.lastDiscard ? this.lastDiscard.tile : null;

    if (responders.length === 0 || tile == null) {
      const from = this.lastDiscard ? this.lastDiscard.pid : this.turn;
      this.pendingClaim = null;
      this.claimResponders = [];
      this.delay(() => {
        if (this.phase === 'claim') this.beginDraw(NEXT_SEAT(from));
      }, 240);
      return;
    }

    const first = responders.shift();
    const p = this.players[first.pid];
    const decision = aiClaim(p, tile, this.visibleCounts(first.pid), this.aiLevel);

    if (decision.action === 'gang' && first.opts.includes('gang')) {
      this.claimGang(first.pid, tile);
      return;
    }
    if (decision.action === 'peng' && first.opts.includes('peng')) {
      this.claimPeng(first.pid, tile);
      return;
    }
    this.delay(() => this.settleClaim(), 260);
  }

  claimPeng(pid, tile) {
    const p = this.players[pid];
    const from = this.lastDiscard.pid;
    const src = this.players[from];
    if (src.river.length > 0 && src.river[src.river.length - 1] === tile) src.river.pop();
    for (let i = 0; i < 2; i++) {
      const k = p.hand.indexOf(tile);
      if (k >= 0) p.hand.splice(k, 1);
    }
    p.melds.push({ type: 'peng', tiles: [tile, tile, tile], from });
    this.pendingClaim = null;
    this.claimRemaining = null;
    this.stopClaimTicker();
    this.claimResponders = [];
    this.lastDiscard = null;
    this.log(PLAYER_NAMES[pid], `碰 ${tileName(tile)}`, true);
    this.phase = 'discard';
    this.turn = pid;
    this.drawnTile = null;
    this.emit();

    if (pid === 0) return; // 真人碰完自己出牌
    this.delay(() => {
      if (this.phase !== 'discard' || this.turn !== pid) return;
      const visible = this.visibleCounts(pid);
      const t = this.discardChoice(pid, visible);
      this.discard(pid, t);
    }, 520);
  }

  claimGang(pid, tile) {
    const p = this.players[pid];
    const from = this.lastDiscard.pid;
    const src = this.players[from];
    if (src.river.length > 0 && src.river[src.river.length - 1] === tile) src.river.pop();
    for (let i = 0; i < 3; i++) {
      const k = p.hand.indexOf(tile);
      if (k >= 0) p.hand.splice(k, 1);
    }
    p.melds.push({ type: 'gang', gangKind: 'ming', tiles: [tile, tile, tile, tile], from });
    this.pendingClaim = null;
    this.claimRemaining = null;
    this.stopClaimTicker();
    this.claimResponders = [];
    this.lastDiscard = null;
    this.log(PLAYER_NAMES[pid], `明杠 ${tileName(tile)}`, true);
    this.gangFlag = true;
    this.emit();

    // 杠后补一张（只能自摸，不存在抢杠胡）
    this.delay(() => this.supplement(pid), 320);
  }

  // ---------- 杠 ----------
  doGang(pid, kind, tile) {
    const p = this.players[pid];
    if (kind === 'an') {
      for (let i = 0; i < 4; i++) {
        const k = p.hand.indexOf(tile);
        if (k >= 0) p.hand.splice(k, 1);
      }
      p.melds.push({ type: 'gang', gangKind: 'an', tiles: [tile, tile, tile, tile] });
      this.log(PLAYER_NAMES[pid], `暗杠 ${tileName(tile)}`, true);
    } else {
      const k = p.hand.indexOf(tile);
      if (k >= 0) p.hand.splice(k, 1);
      const meld = p.melds.find((m) => m.type === 'peng' && m.tiles[0] === tile);
      if (meld) {
        meld.type = 'gang';
        meld.gangKind = 'bu';
        meld.tiles.push(tile);
      }
      this.log(PLAYER_NAMES[pid], `补杠 ${tileName(tile)}`, true);
    }
    this.gangFlag = true;
    this.drawnTile = null;
    this.emit();
    this.delay(() => this.supplement(pid), 300);
  }

  // 杠后补牌
  supplement(pid) {
    if (this.wall.length === 0) {
      this.finishDrawGame();
      return;
    }
    const tile = this.wall.pop();
    const p = this.players[pid];
    p.hand.push(tile);
    this.drawnTile = tile;
    this.phase = 'discard';
    this.turn = pid;
    this.log(PLAYER_NAMES[pid], `杠后补牌${pid === 0 ? ` ${tileName(tile)}` : ''}`);

    if (canWinHand(p.hand, p.melds.length)) {
      if (pid === 0) {
        this.log('系统', '杠上开花！点击「自摸胡」结算', true);
        this.emit();
        return;
      }
      this.delay(() => this.declareZimo(pid, true), 480);
      this.emit();
      return;
    }
    this.emit();
    if (pid !== 0) {
      this.delay(() => this.aiTurn(pid), 420 + Math.random() * 380);
    }
  }

  // ---------- 真人操作 ----------
  humanActions() {
    const p = this.players[0];
    const meldCount = p.melds.length;
    const acts = {
      canDraw: this.phase === 'draw' && this.turn === 0 && this.wall.length > 0,
      canZimo: false,
      canPeng: false,
      canGang: false,
      canPass: false,
      gangOptions: [],
      claimTile: null
    };
    if (this.phase === 'discard' && this.turn === 0) {
      acts.canZimo = canWinHand(p.hand, meldCount);
      acts.gangOptions = this.humanGangOptions();
      acts.canGang = acts.gangOptions.length > 0;
    }
    if (this.phase === 'claim' && this.pendingClaim) {
      const opts = this.pendingClaim.options || [];
      acts.canPeng = opts.includes('peng');
      acts.canGang = opts.includes('gang');
      acts.canPass = true;
      acts.claimTile = this.pendingClaim.tile;
    }
    return acts;
  }

  humanGangOptions() {
    const p = this.players[0];
    const counts = countMap(p.hand);
    const out = [];
    for (let t = 0; t < 30; t++) if (counts[t] === 4 && !isWild(t)) out.push({ kind: 'an', tile: t });
    for (const m of p.melds) {
      if (m.type === 'peng' && !isWild(m.tiles[0]) && counts[m.tiles[0]] >= 1) {
        out.push({ kind: 'bu', tile: m.tiles[0] });
      }
    }
    return out;
  }

  humanZimo() {
    if (this.phase !== 'discard' || this.turn !== 0) return false;
    if (!canWinHand(this.players[0].hand, this.players[0].melds.length)) return false;
    this.declareZimo(0, this.gangFlag);
    return true;
  }

  humanPeng() {
    if (this.phase !== 'claim' || !this.pendingClaim) return false;
    if (!this.pendingClaim.options.includes('peng')) return false;
    if (this.claimHumanTimer) clearTimeout(this.claimHumanTimer);
    this.stopClaimTicker();
    this.claimPeng(0, this.pendingClaim.tile);
    return true;
  }

  humanGangClaim() {
    if (this.phase !== 'claim' || !this.pendingClaim) return false;
    if (!this.pendingClaim.options.includes('gang')) return false;
    if (this.claimHumanTimer) clearTimeout(this.claimHumanTimer);
    this.stopClaimTicker();
    this.claimGang(0, this.pendingClaim.tile);
    return true;
  }

  humanGangSelf(kind, tile) {
    if (this.phase !== 'discard' || this.turn !== 0) return false;
    const opts = this.humanGangOptions();
    if (!opts.some((o) => o.kind === kind && o.tile === tile)) return false;
    this.doGang(0, kind, tile);
    return true;
  }

  humanPass() {
    if (this.phase !== 'claim' || !this.pendingClaim) return false;
    if (this.claimHumanTimer) clearTimeout(this.claimHumanTimer);
    this.stopClaimTicker();
    this.claimRemaining = null;
    const from = this.lastDiscard ? this.lastDiscard.pid : this.pendingClaim.from;
    this.pendingClaim = null;
    this.emit();
    if (this.claimResponders && this.claimResponders.length > 0) {
      this.settleClaim();
    } else {
      this.delay(() => this.beginDraw(NEXT_SEAT(from)), 240);
    }
    return true;
  }

  canSelfWin(pid) {
    const p = this.players[pid];
    return this.phase === 'discard' && this.turn === pid && canWinHand(p.hand, p.melds.length);
  }

  // ---------- 结算 ----------
  declareZimo(pid, gangKai = false) {
    const p = this.players[pid];
    const fan = evaluateFan(sortTiles(p.hand), p.melds, { gangKai });
    const base = scoreOf(fan.total);
    const delta = base * 3;
    this.scores[pid] += delta;
    for (let i = 0; i < 4; i++) if (i !== pid) this.scores[i] -= base;
    if (pid === 0) this.zimoCount += 1;

    this.winInfo = {
      draw: false,
      pid,
      hand: sortTiles(p.hand),
      melds: p.melds.map((m) => ({ ...m })),
      fan,
      delta,
      base,
      gangKai
    };
    this.phase = 'over';
    this.log(
      PLAYER_NAMES[pid],
      `自摸胡牌！${fan.fans.map((f) => f.name).join(' + ')} · ${fan.total} 番 · 收 ${delta} 分`,
      true
    );
    this.emit();
  }

  finishDrawGame() {
    this.winInfo = { draw: true };
    this.phase = 'over';
    this.log('系统', '牌墙摸完，本局流局', true);
    this.emit();
  }

  // ---------- 辅助 ----------
  /** 场上可见的牌（除自己手牌外所有明牌） */
  visibleCounts(excludePid) {
    const counts = new Array(30).fill(0);
    for (const p of this.players) {
      if (p.pid === excludePid) continue;
      for (const t of p.river) counts[t]++;
      for (const m of p.melds) for (const t of m.tiles) counts[t]++;
    }
    return counts;
  }

  discardChoice(pid, visible) {
    const p = this.players[pid];
    return aiDiscard(p.hand, p.melds.length, visible, this.aiLevel);
  }

  /** 打出任意一张后的听口列表（供 UI 提示） */
  handListenTiles(pid) {
    const p = this.players[pid];
    const total = p.hand.length + p.melds.length * 3;
    if (total % 3 !== 2) return [];
    const seen = new Set();
    const out = [];
    for (const t of sortTiles(p.hand)) {
      if (seen.has(t)) continue;
      seen.add(t);
      const rest = p.hand.slice();
      rest.splice(rest.indexOf(t), 1);
      const waits = waitingTiles(rest, p.melds.length);
      if (waits.length > 0) out.push({ discard: t, waits });
    }
    return out;
  }
}
