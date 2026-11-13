// ============================================================================
// 规则引擎：牌编码、胡牌判定、分解枚举、听牌分析、番型计算、AI 出牌评估
// 牌编码：万 0-8，饼 9-17，条 18-26，箭牌（中 27 / 发 28 / 白 29）
// 总牌数：30 种 x 4 张 = 120 张
// ============================================================================

export const SUITS = ['万', '饼', '条'];
export const HONORS = ['中', '发', '白'];
export const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const ALL_TILES = Array.from({ length: 30 }, (_, i) => i);

export const TILE_TOTAL = 120;

export function suitOf(code) {
  if (code < 9) return 0;
  if (code < 18) return 1;
  if (code < 27) return 2;
  return 3;
}

export function numOf(code) {
  return code < 27 ? (code % 9) + 1 : 0;
}

export function isHonor(code) {
  return code >= 27;
}

export function tileName(code) {
  if (code == null || code < 0 || code > 29) return '';
  if (code >= 27) return HONORS[code - 27];
  return CN_NUM[code % 9] + SUITS[Math.floor(code / 9)];
}

export function tileShort(code) {
  if (code >= 27) return HONORS[code - 27];
  return `${(code % 9) + 1}${SUITS[Math.floor(code / 9)]}`;
}

/** 完整牌墙：120 张，每张 4 副 */
export function buildWall() {
  const wall = [];
  for (const t of ALL_TILES) {
    for (let i = 0; i < 4; i++) wall.push(t);
  }
  return wall;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function sortTiles(tiles) {
  return tiles.slice().sort((x, y) => x - y);
}

export function countMap(tiles) {
  const counts = new Array(30).fill(0);
  for (const t of tiles) counts[t]++;
  return counts;
}

// ============================================================================
// 百搭（癞子）
// 本规则下【中】(code 27) 为万能牌，可替代任意一张牌参与顺、刻、将
// 【发】【白】仍为普通箭牌；【中】不能作百搭之外的"实体牌"定义面子
// ============================================================================
export const WILD_TILE = 27;

export function isWild(code) {
  return code === WILD_TILE;
}

/** 把百搭牌拆出来，返回 [非百搭手牌计数, 百搭数量] */
export function splitWilds(tiles) {
  const counts = new Array(30).fill(0);
  let wilds = 0;
  for (const t of tiles) {
    if (isWild(t)) wilds++;
    else counts[t]++;
  }
  return { counts, wilds };
}

// ============================================================================
// 胡牌判定
// 手牌长度 + 副露数 * 3 必须形如 3n + 2
// 牌型：4 组面子（顺 / 刻 / 杠算一组）+ 1 对将；门清 14 张另支持七对
// 【中】作百搭，可替代任意牌；只能自摸胡，不接受点炮与抢杠
// ============================================================================

export function canWinHand(hand, meldCount = 0) {
  const total = hand.length + meldCount * 3;
  if (total % 3 !== 2) return false;
  if (total < 2) return false;

  const { counts, wilds } = splitWilds(hand);
  const needSets = 4 - meldCount;
  if (needSets < 0) return false;

  // 七对：仅门清，百搭可补缺
  if (meldCount === 0 && hand.length === 14) {
    if (sevenPairsWithWilds(counts, wilds)) return true;
  }

  return winWithWilds(counts, wilds, needSets);
}

/** 拆成 needSets 组面子 + 1 将，百搭补位 */
function winWithWilds(counts, wilds, needSets) {
  return tryEyes(counts.slice(), wilds, needSets);
}

function tryEyes(counts, wilds, needSets) {
  // 门清且只有 1 张牌时，两张将需 1 个百搭
  for (let i = 0; i < 30; i++) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      const ok = trySets(counts, wilds, needSets, 0);
      counts[i] += 2;
      if (ok) return true;
    } else if (counts[i] === 1 && wilds >= 1) {
      counts[i] -= 1;
      const ok = trySets(counts, wilds - 1, needSets, 0);
      counts[i] += 1;
      if (ok) return true;
    }
  }
  // 两张百搭直接作将
  if (wilds >= 2 && trySets(counts, wilds - 2, needSets, 0)) return true;
  return false;
}

function trySets(counts, wilds, needSets, from, budget = { n: 0 }) {
  if (++budget.n > 20000) return false;
  let i = from;
  while (i < 30 && counts[i] === 0) i++;
  if (i >= 30) {
    return wilds >= needSets * 3;
  }
  if (needSets <= 0) {
    let leftover = 0;
    for (let k = i; k < 30; k++) leftover += counts[k];
    return leftover === 0 && wilds === 0;
  }

  // 1) 刻子：现有牌 + 百搭
  for (let use = Math.min(3, counts[i]); use >= 1; use--) {
    const need = 3 - use;
    if (need > wilds) continue;
    counts[i] -= use;
    const ok = trySets(counts, wilds - need, needSets - 1, i, budget);
    counts[i] += use;
    if (ok) return true;
  }

  // 2) 顺子：必须包含 i，缺位由百搭补
  if (i < 27 && i % 9 <= 6) {
    for (let mask = 0; mask < 8; mask++) {
      const useA = mask & 1;
      const useB = (mask >> 1) & 1;
      const useC = (mask >> 2) & 1;
      if (!useA) continue;
      const used = [useA, useB, useC];
      let need = 0;
      let valid = true;
      for (let k = 0; k < 3; k++) {
        if (used[k]) {
          if (counts[i + k] <= 0) valid = false;
        } else {
          need++;
        }
      }
      if (!valid || need > wilds) continue;
      for (let k = 0; k < 3; k++) if (used[k]) counts[i + k]--;
      const ok = trySets(counts, wilds - need, needSets - 1, i, budget);
      for (let k = 0; k < 3; k++) if (used[k]) counts[i + k]++;
      if (ok) return true;
    }
  }

  // 3) 孤立牌整组用百搭补成刻子
  const takeAll = Math.min(3, counts[i]);
  const needWild = 3 - takeAll;
  if (needWild <= wilds) {
    counts[i] -= takeAll;
    const ok = trySets(counts, wilds - needWild, needSets - 1, i, budget);
    counts[i] += takeAll;
    if (ok) return true;
  }
  return false;
}

function sevenPairsWithWilds(counts, wilds) {
  let pairs = 0;
  let singles = 0;
  for (let i = 0; i < 30; i++) {
    pairs += Math.floor(counts[i] / 2);
    singles += counts[i] % 2;
  }
  // 单牌优先与百搭组成对子
  const wildPairs = Math.min(wilds, singles);
  pairs += wildPairs;
  let rest = wilds - wildPairs;
  pairs += Math.floor(rest / 2);
  return pairs >= 7;
}

/** 是否七对（【中】可作百搭补对） */
export function isSevenPairs(hand, meldCount = 0) {
  if (meldCount !== 0 || hand.length !== 14) return false;
  const { counts, wilds } = splitWilds(hand);
  return sevenPairsWithWilds(counts, wilds);
}

/** 枚举所有「将牌 + 面子」分解方案，用于番型判定与牌型展示 */
export function decomposeAll(hand) {
  const results = [];
  const counts = countMap(hand);

  const pick = (from) => {
    let idx = from;
    while (idx < 30 && counts[idx] === 0) idx++;
    if (idx >= 30) return [[]];
    const out = [];
    if (counts[idx] >= 3) {
      counts[idx] -= 3;
      for (const rest of pick(idx)) out.push([{ type: 'pung', tile: idx }, ...rest]);
      counts[idx] += 3;
    }
    if (idx < 27 && idx % 9 <= 6 && counts[idx + 1] > 0 && counts[idx + 2] > 0) {
      counts[idx]--;
      counts[idx + 1]--;
      counts[idx + 2]--;
      for (const rest of pick(idx)) out.push([{ type: 'chow', tile: idx }, ...rest]);
      counts[idx]++;
      counts[idx + 1]++;
      counts[idx + 2]++;
    }
    return out;
  };

  const unique = new Set();
  for (let i = 0; i < 30; i++) {
    if (counts[i] >= 2) {
      counts[i] -= 2;
      const meldSets = pick(0);
      counts[i] += 2;
      for (const melds of meldSets) {
        const key = `${i}|` + melds.map((m) => `${m.type}${m.tile}`).join(',');
        if (unique.has(key)) continue;
        unique.add(key);
        results.push({ eye: i, melds });
      }
    }
  }
  return results;
}

// ============================================================================
// 听牌分析
// ============================================================================

/** hand 长度须为 3n+1，返回所有可自摸的牌 */
export function waitingTiles(hand, meldCount = 0, visible = null) {
  const res = [];
  if ((hand.length + meldCount * 3) % 3 !== 1) return res;
  const own = countMap(hand);
  for (const t of ALL_TILES) {
    const usedByMe = own[t];
    const usedVisible = visible ? visible[t] || 0 : 0;
    if (usedByMe + usedVisible >= 4) continue;
    if (canWinHand([...hand, t], meldCount)) res.push(t);
  }
  return res;
}

/** 打出某张后是否听牌，返回听口 */
export function listenAfterDiscard(hand, tile, meldCount = 0, visible = null) {
  const rest = hand.slice();
  const i = rest.indexOf(tile);
  if (i >= 0) rest.splice(i, 1);
  if ((rest.length + meldCount * 3) % 3 !== 1) return [];
  return waitingTiles(rest, meldCount, visible);
}

// ============================================================================
// 番型计算
// ============================================================================

export const FAN_LABEL = {
  pinghu: '平胡',
  pengpeng: '碰碰胡',
  qingyise: '清一色',
  qidui: '七对',
  gangkai: '杠上开花',
  jingou: '金钩钓',
  baida: '百搭',
  zimo: '自摸'
};

/**
 * @param {number[]} hand 手中暗牌（含胡牌张）
 * @param {Array} melds 副露 [{type:'peng'|'gang'|'chi', tiles:[...]}]
 * @param {{gangKai?:boolean}} options
 */
export function evaluateFan(hand, melds = [], options = {}) {
  const { gangKai = false } = options;
  const fans = [];
  const wilds = hand.filter((t) => isWild(t)).length;

  // 清一色只看实数牌花色，百搭不计入花色统计
  const solidTiles = [...hand.filter((t) => !isWild(t))];
  for (const m of melds) solidTiles.push(...(m.tiles || []));
  const suits = new Set(solidTiles.map((t) => suitOf(t)));
  const onlyOne = suits.size === 1 && !suits.has(3);

  if (isSevenPairs(hand, melds.length)) {
    fans.push({ key: 'qidui', name: FAN_LABEL.qidui, fan: 4 });
  } else {
    const decomps = decomposeAll(hand);
    let best = null;
    for (const d of decomps) {
      const pungs =
        d.melds.filter((m) => m.type === 'pung').length + melds.filter((m) => m.type !== 'chi').length;
      const chows =
        d.melds.filter((m) => m.type === 'chow').length + melds.filter((m) => m.type === 'chi').length;
      const score = pungs * 2 - chows;
      if (!best || score > best.score) best = { pungs, chows, score };
    }
    if (best && best.chows === 0) fans.push({ key: 'pengpeng', name: FAN_LABEL.pengpeng, fan: 2 });
  }

  if (onlyOne) fans.push({ key: 'qingyise', name: FAN_LABEL.qingyise, fan: 4 });
  if (melds.length > 0 && hand.length === 2) fans.push({ key: 'jingou', name: FAN_LABEL.jingou, fan: 2 });
  if (gangKai) fans.push({ key: 'gangkai', name: FAN_LABEL.gangkai, fan: 2 });
  if (wilds > 0) fans.push({ key: 'baida', name: FAN_LABEL.baida, fan: 1 });
  if (fans.length === 0) fans.push({ key: 'pinghu', name: FAN_LABEL.pinghu, fan: 1 });

  // 本规则只能自摸，自摸固定计 1 番
  fans.push({ key: 'zimo', name: FAN_LABEL.zimo, fan: 1 });

  const total = fans.reduce((s, f) => s + f.fan, 0);
  return { fans, total, wilds };
}

/** 底分 * 番数，用于结算 */
export const BASE_SCORE = 2;
export function scoreOf(fanTotal) {
  return BASE_SCORE * Math.max(1, fanTotal);
}

// ============================================================================
// 牌效评估（AI 使用）
// ============================================================================

function blocksOf(counts) {
  const c = counts.slice();
  let blocks = 0;
  for (let i = 0; i < 30; i++) {
    while (c[i] >= 3) {
      c[i] -= 3;
      blocks++;
    }
  }
  for (let i = 0; i < 27; i++) {
    if (i % 9 <= 6) {
      while (c[i] > 0 && c[i + 1] > 0 && c[i + 2] > 0) {
        c[i]--;
        c[i + 1]--;
        c[i + 2]--;
        blocks++;
      }
    }
  }
  let partial = 0;
  let pairs = 0;
  for (let i = 0; i < 30; i++) {
    if (c[i] >= 2) {
      pairs++;
      c[i] -= 2;
      partial++;
    }
  }
  for (let i = 0; i < 27; i++) {
    if (i % 9 <= 7 && c[i] > 0 && c[i + 1] > 0) {
      c[i]--;
      c[i + 1]--;
      partial++;
    }
  }
  for (let i = 0; i < 27; i++) {
    if (i % 9 <= 6 && c[i] > 0 && c[i + 2] > 0) {
      c[i]--;
      c[i + 2]--;
      partial++;
    }
  }
  let singles = 0;
  for (let i = 0; i < 30; i++) singles += c[i];
  return { blocks, partial, pairs, singles };
}

function shantenApprox(counts, meldCount) {
  const { blocks, partial, pairs } = blocksOf(counts);
  const totalBlocks = blocks + Math.min(partial, Math.max(0, 4 - blocks));
  const need = 4 - Math.min(4, totalBlocks);
  let st = need * 2;
  if (pairs === 0) st += 1;
  st -= meldCount * 2;
  return st;
}

/** 打出 tile 后的牌面价值，越大越值得保留（即越不该打） */
export function tileValue(hand, tile, meldCount = 0, visible = null) {
  // 百搭牌永远最后考虑打出
  if (isWild(tile)) return 10000;

  const rest = hand.slice();
  const idx = rest.indexOf(tile);
  if (idx >= 0) rest.splice(idx, 1);

  // 手里还有百搭时，牌面价值整体提升（百搭能把烂牌救活）
  const wilds = rest.filter((t) => isWild(t)).length;
  const solid = rest.filter((t) => !isWild(t));
  const counts = countMap(solid);
  const st = shantenApprox(counts, meldCount);

  let ukeire = 0;
  for (let t = 0; t < 30; t++) {
    const remaining = 4 - counts[t] - (visible ? visible[t] || 0 : 0);
    if (remaining <= 0) continue;
    counts[t]++;
    if (shantenApprox(counts, meldCount) < st) ukeire += remaining;
    counts[t]--;
  }

  const honor = isHonor(tile);
  const n = numOf(tile);
  const middle = !honor && n >= 3 && n <= 7 ? 1.2 : 0;
  const keepBonus = counts[tile] >= 1 ? 1.5 : 0;

  return -st * 100 + ukeire * 3 + middle + keepBonus + (honor ? -0.8 : 0) + wilds * 4;
}

/** AI 选择打出的牌：百搭永不打出 */
export function chooseDiscard(hand, meldCount = 0, visible = null, rng = Math.random) {
  const candidates = hand.filter((t) => !isWild(t));
  const pool = candidates.length > 0 ? candidates : hand;
  let best = pool[0];
  let bestScore = -Infinity;
  const tried = new Set();
  for (const t of pool) {
    if (tried.has(t)) continue;
    tried.add(t);
    const s = tileValue(hand, t, meldCount, visible) + rng() * 1.5;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}
