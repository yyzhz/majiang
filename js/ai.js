// ============================================================================
// AI 决策：三档强度（easy / normal / hard）
//   easy   —— 随机打牌，碰杠意愿低（适合新手练习）
//   normal —— 原有启发式策略
//   hard   —— 精确向听数搜索 + 进张评估，积极碰杠
// 只做自摸胡，因此 AI 不会去"胡"别人打出的牌
// ============================================================================
import { canWinHand, chooseDiscard, countMap, isWild, WILD_TILE, waitingTiles, tileName } from './mahjong.js';

export const AI_LEVELS = ['easy', 'normal', 'hard'];
export const AI_LEVEL_NAMES = { easy: '简单', normal: '普通', hard: '困难' };

/** 手上是否有可暗杠的牌（红中作为百搭不参与杠） */
export function findAnGang(hand) {
  const counts = countMap(hand);
  const out = [];
  for (let t = 0; t < 30; t++) if (counts[t] === 4 && !isWild(t)) out.push(t);
  return out;
}

/** 已碰出的刻子是否可补杠（红中不参与） */
export function findBuGang(hand, melds) {
  const counts = countMap(hand);
  const out = [];
  for (const m of melds) {
    const t = m.tiles[0];
    if (m.type === 'peng' && !isWild(t) && counts[t] >= 1) out.push(t);
  }
  return out;
}

/** 摸牌后的自摸判断 */
export function aiCanZimo(hand, meldCount) {
  return canWinHand(hand, meldCount);
}

// 各档位的暗杠 / 补杠意愿
const GANG_P = {
  easy: { an: 0.45, bu: 0.3 },
  normal: { an: 0.85, bu: 0.6 },
  hard: { an: 0.92, bu: 0.8 }
};

/** 简单档：随机打一张（百搭除外） */
function randomDiscard(hand, rng = Math.random) {
  const cands = hand.filter((t) => !isWild(t));
  const pool = cands.length > 0 ? cands : hand;
  return pool[Math.floor(rng() * pool.length)];
}

// ============================================================================
// 精确向听数（含百搭）：递归枚举面子 / 搭子 / 对子，取最优拆分
// ============================================================================
function shantenCounts(counts, meldCount) {
  const wildCount = counts[WILD_TILE];
  const c = counts.slice();
  c[WILD_TILE] = 0;
  let best = 8;
  const memo = new Map();

  function key(cArr, m, p, w, d, s) {
    let k = `${m},${p},${w},${d},${s}:`;
    for (let i = 0; i < 30; i++) if (cArr[i]) k += `${i}x${cArr[i]},`;
    return k;
  }

  // 收尾：用百搭与剩余孤张做最后的贪心配对
  function leaf(m, p, w, d, s) {
    let mm = m + meldCount;
    let pw = p;
    let dw = d;
    let singles = s;
    let extra = w;
    // 三张百搭凑面子
    while (extra >= 3 && mm < 4) {
      mm += 1;
      extra -= 3;
    }
    // 两张百搭 + 一张孤张凑面子
    while (extra >= 2 && singles > 0 && mm < 4) {
      mm += 1;
      extra -= 2;
      singles -= 1;
    }
    // 凑将：两张百搭，或一张百搭 + 一张孤张
    if (pw === 0) {
      if (extra >= 2) {
        pw = 1;
        extra -= 2;
      } else if (extra >= 1 && singles >= 1) {
        pw = 1;
        extra -= 1;
        singles -= 1;
      }
    }
    // 一张百搭 + 一张孤张凑搭子
    while (extra >= 1 && singles >= 1 && dw < 4) {
      dw += 1;
      extra -= 1;
      singles -= 1;
    }
    // 剩余两张百搭凑一个搭子
    if (extra >= 2) dw += 1;

    mm = Math.min(4, mm);
    if (mm >= 4 && pw === 0) return 1;
    const need = 4 - mm;
    // 多余的对子可以当作搭子（对倒听牌）
    const extraPairs = pw > 0 ? pw - 1 : 0;
    return Math.max(0, need * 2 - Math.min(need, dw + extraPairs) - (pw > 0 ? 1 : 0));
  }

  function dfs(cArr, m, p, w, d, s) {
    if (m > 4) return 8;
    const k = key(cArr, m, p, w, d, s);
    const hit = memo.get(k);
    if (hit !== undefined) return hit;

    let t = -1;
    for (let i = 0; i < 30; i++) {
      if (cArr[i] > 0) {
        t = i;
        break;
      }
    }
    let result;
    if (t < 0) {
      result = leaf(m, p, w, d, s);
    } else {
      // 1) 孤张
      const n1 = cArr.slice();
      n1[t] -= 1;
      result = dfs(n1, m, p, w, d, s + 1);

      // 2) 对子
      if (cArr[t] >= 2) {
        const n2 = cArr.slice();
        n2[t] -= 2;
        result = Math.min(result, dfs(n2, m, p + 1, w, d, s));
      } else if (w > 0) {
        const n2 = cArr.slice();
        n2[t] -= 1;
        result = Math.min(result, dfs(n2, m, p + 1, w - 1, d, s));
      }

      // 3) 刻子
      if (cArr[t] >= 3) {
        const n3 = cArr.slice();
        n3[t] -= 3;
        result = Math.min(result, dfs(n3, m + 1, p, w, d, s));
      }
      if (cArr[t] >= 2 && w > 0) {
        const n3 = cArr.slice();
        n3[t] -= 2;
        result = Math.min(result, dfs(n3, m + 1, p, w - 1, d, s));
      }
      if (cArr[t] >= 1 && w >= 2) {
        const n3 = cArr.slice();
        n3[t] -= 1;
        result = Math.min(result, dfs(n3, m + 1, p, w - 2, d, s));
      }

      // 4) 顺子（同花色连续，可用百搭补缺）
      if (t < 27 && t % 9 <= 6) {
        let need = 0;
        if (cArr[t + 1] === 0) need += 1;
        if (cArr[t + 2] === 0) need += 1;
        if (need <= w) {
          const n4 = cArr.slice();
          n4[t] -= 1;
          if (cArr[t + 1] > 0) n4[t + 1] -= 1;
          if (cArr[t + 2] > 0) n4[t + 2] -= 1;
          result = Math.min(result, dfs(n4, m + 1, p, w - need, d, s));
        }
      }

      // 5) 搭子（相邻 / 隔张，可用百搭补缺）
      if (t < 27 && t % 9 <= 7) {
        if (cArr[t + 1] > 0) {
          const n5 = cArr.slice();
          n5[t] -= 1;
          n5[t + 1] -= 1;
          result = Math.min(result, dfs(n5, m, p, w, d + 1, s));
        } else if (w > 0) {
          const n5 = cArr.slice();
          n5[t] -= 1;
          result = Math.min(result, dfs(n5, m, p, w - 1, d + 1, s));
        }
      }
      if (t < 27 && t % 9 <= 6) {
        if (cArr[t + 2] > 0) {
          const n6 = cArr.slice();
          n6[t] -= 1;
          n6[t + 2] -= 1;
          result = Math.min(result, dfs(n6, m, p, w, d + 1, s));
        } else if (w > 0) {
          const n6 = cArr.slice();
          n6[t] -= 1;
          result = Math.min(result, dfs(n6, m, p, w - 1, d + 1, s));
        }
      }
    }
    memo.set(k, result);
    if (result < best) best = result;
    return result;
  }

  dfs(c, 0, 0, wildCount, 0, 0);
  return best;
}

/** 整手牌的精确向听数（含副露折算） */
export function shantenExact(hand, meldCount = 0) {
  return shantenCounts(countMap(hand), meldCount);
}

/** 进张数：能降低向听的牌，按剩余张数加权 */
function ukeireOf(hand, meldCount, visible) {
  const counts = countMap(hand);
  const base = shantenCounts(counts, meldCount);
  let total = 0;
  for (let t = 0; t < 30; t++) {
    const remaining = 4 - counts[t] - (visible ? visible[t] || 0 : 0);
    if (remaining <= 0) continue;
    counts[t] += 1;
    if (shantenCounts(counts, meldCount) < base) total += remaining;
    counts[t] -= 1;
  }
  return total;
}

/** 困难档：打出后向听最低；平手选进张最多、最安全的一张 */
function smartDiscard(hand, meldCount, visible) {
  const cands = [];
  const seen = new Set();
  for (const t of hand) {
    if (isWild(t) || seen.has(t)) continue;
    seen.add(t);
    cands.push(t);
  }
  if (cands.length === 0) return hand[0];

  let bestSt = Infinity;
  let bestTiles = [];
  for (const t of cands) {
    const rest = hand.slice();
    rest.splice(rest.indexOf(t), 1);
    const st = shantenCounts(countMap(rest), meldCount);
    if (st < bestSt) {
      bestSt = st;
      bestTiles = [t];
    } else if (st === bestSt) {
      bestTiles.push(t);
    }
  }
  if (bestTiles.length === 1) return bestTiles[0];

  let bestUke = -1;
  let out = bestTiles[0];
  for (const t of bestTiles) {
    const rest = hand.slice();
    rest.splice(rest.indexOf(t), 1);
    const u = ukeireOf(rest, meldCount, visible);
    if (u > bestUke) {
      bestUke = u;
      out = t;
    }
  }
  return out;
}

/** 按档位选一张牌打出 */
export function aiDiscard(hand, meldCount, visible, level = 'normal', rng = Math.random) {
  if (level === 'easy') return randomDiscard(hand, rng);
  if (level === 'hard') return smartDiscard(hand, meldCount, visible);
  return chooseDiscard(hand, meldCount, visible, rng);
}

/**
 * 最优出牌建议（供真人「提示」按钮）：
 * 优先向听数最低 → 听牌时门数最多 → 进张（实际剩余张数）最多 → 外面剩余张数（越大越安全）。
 * 存在并列最优（向听、门数、进张均相同）时一并列出。
 * 返回 { tile, fromShanten, toShanten, ukeire, waits, reason, alts }
 */
export function bestDiscardSuggestion(hand, meldCount, visible) {
  const from = shantenCounts(countMap(hand), meldCount);
  const seen = new Set();
  const cands = [];
  for (const t of hand) {
    if (isWild(t) || seen.has(t)) continue;
    seen.add(t);
    cands.push(t);
  }
  if (cands.length === 0) {
    return {
      tile: hand[0],
      fromShanten: from,
      toShanten: from,
      ukeire: 0,
      waits: [],
      alts: [],
      reason: '手中只剩百搭（红中），必留作万能牌'
    };
  }

  const candidates = cands.map((t) => {
    const rest = hand.slice();
    rest.splice(rest.indexOf(t), 1);
    const st = shantenCounts(countMap(rest), meldCount);
    const left = 4 - hand.filter((x) => x === t).length - (visible[t] || 0);
    const cand = { tile: t, fromShanten: from, toShanten: st, left, waits: [] };
    if (st === 0) {
      // 听牌方案：进张 = 所有可胡牌的实际剩余张数
      // （ukeireOf 对听牌手恒为 0，不能用于方案间比较）
      cand.waits = waitingTiles(rest, meldCount);
      cand.ukeire = cand.waits.reduce(
        (sum, w) => sum + Math.max(0, 4 - rest.filter((x) => x === w).length - (visible[w] || 0)),
        0
      );
    } else {
      cand.ukeire = ukeireOf(rest, meldCount, visible);
    }
    return cand;
  });

  // 字典序：向听低 > 门数多 > 进张多 > 外面剩多
  const better = (a, b) => {
    if (a.toShanten !== b.toShanten) return a.toShanten < b.toShanten;
    if (a.toShanten === 0 && a.waits.length !== b.waits.length) return a.waits.length > b.waits.length;
    if (a.ukeire !== b.ukeire) return a.ukeire > b.ukeire;
    return a.left > b.left;
  };

  let best = candidates[0];
  for (let i = 1; i < candidates.length; i++) {
    if (better(candidates[i], best)) best = candidates[i];
  }

  // 并列最优：向听、门数、进张均相同（外面剩张不同也算并列，仅影响主推荐）
  const alts = candidates.filter(
    (c) =>
      c !== best &&
      c.toShanten === best.toShanten &&
      c.ukeire === best.ukeire &&
      c.waits.length === best.waits.length
  );

  const altText =
    alts.length > 0
      ? `；同样可打 ${alts.map((a) => `${tileName(a.tile)}（进张 ${a.ukeire} 张）`).join('、')}`
      : '';

  if (best.toShanten === 0) {
    const names = best.waits.map((t) => tileName(t));
    const shown = names.length > 6
      ? `${names.slice(0, 6).join('、')} 等 ${names.length} 门`
      : names.join('、');
    best.reason = `打出后即听牌${shown ? `，听 ${shown}` : ''}，进张 ${best.ukeire} 张${altText}`;
  } else if (best.toShanten < best.fromShanten) {
    best.reason = `向听 ${best.fromShanten} → ${best.toShanten}，进张 ${best.ukeire} 张，外面剩 ${best.left} 张${altText}`;
  } else {
    best.reason = `维持 ${best.fromShanten} 向听，进张最多 ${best.ukeire} 张，外面剩 ${best.left} 张${altText}`;
  }
  best.alts = alts;
  return best;
}

/**
 * 摸牌后决策：返回 { action: 'zimo'|'gang'|'discard', kind?, tile }
 */
export function aiAfterDraw(player, visible, level = 'normal') {
  const meldCount = player.melds.length;
  if (canWinHand(player.hand, meldCount)) {
    return { action: 'zimo' };
  }
  const gp = GANG_P[level] || GANG_P.normal;
  const anGang = findAnGang(player.hand);
  if (anGang.length > 0 && Math.random() < gp.an) {
    return { action: 'gang', kind: 'an', tile: anGang[0] };
  }
  const buGang = findBuGang(player.hand, player.melds);
  if (buGang.length > 0 && Math.random() < gp.bu) {
    return { action: 'gang', kind: 'bu', tile: buGang[0] };
  }
  const tile = aiDiscard(player.hand, meldCount, visible, level);
  return { action: 'discard', tile };
}

/**
 * 他人出牌时的响应决策：返回 { action: 'peng'|'gang'|'pass' }
 * 明杠收益高，优先；碰牌按档位评估
 */
export function aiClaim(player, tile, visible, level = 'normal') {
  const counts = countMap(player.hand);
  const same = counts[tile] || 0;

  if (same >= 3) {
    if (level === 'easy') return Math.random() < 0.5 ? { action: 'gang' } : { action: 'pass' };
    return { action: 'gang' };
  }

  if (same === 2) {
    if (level === 'easy') {
      return Math.random() < 0.15 ? { action: 'peng' } : { action: 'pass' };
    }
    if (level === 'hard') {
      const meldCount = player.melds.length;
      const rest = player.hand.slice();
      for (let i = 0; i < 2; i++) rest.splice(rest.indexOf(tile), 1);
      const after = shantenCounts(countMap(rest), meldCount + 1);
      const before = shantenCounts(countMap(player.hand), meldCount);
      // 碰后向听改善才碰；已接近听牌时不恶化也可碰
      if (after < before || (after === before && after <= 1)) return { action: 'peng' };
      return { action: 'pass' };
    }
    // 普通档：原有启发式
    const meldCount = player.melds.length + 1;
    const rest = player.hand.slice();
    for (let i = 0; i < 2; i++) rest.splice(rest.indexOf(tile), 1);
    const afterShanten = shantenLite(rest, meldCount);
    const beforeShanten = shantenLite(player.hand, meldCount - 1);
    const willing = afterShanten < beforeShanten || Math.random() < 0.35;
    if (willing) return { action: 'peng' };
  }
  return { action: 'pass' };
}

/** 极简向听估算，仅供普通档碰牌决策参考 */
function shantenLite(hand, meldCount) {
  // 以「手里能凑出的面子数 + 搭子数」粗略评估
  const counts = countMap(hand);
  let sets = 0;
  let partials = 0;
  for (let t = 0; t < 30; t++) {
    while (counts[t] >= 3) {
      counts[t] -= 3;
      sets++;
    }
  }
  for (let base = 0; base < 27; base += 9) {
    for (let i = base; i < base + 7; i++) {
      while (counts[i] > 0 && counts[i + 1] > 0 && counts[i + 2] > 0) {
        counts[i]--;
        counts[i + 1]--;
        counts[i + 2]--;
        sets++;
      }
    }
  }
  for (let t = 0; t < 30; t++) {
    if (counts[t] >= 2) {
      partials++;
      counts[t] -= 2;
    }
  }
  for (let base = 0; base < 27; base += 9) {
    for (let i = base; i < base + 8; i++) {
      if (counts[i] > 0 && counts[i + 1] > 0) {
        partials++;
        counts[i]--;
        counts[i + 1]--;
      }
    }
    for (let i = base; i < base + 7; i++) {
      if (counts[i] > 0 && counts[i + 2] > 0) {
        partials++;
        counts[i]--;
        counts[i + 2]--;
      }
    }
  }
  const totalSets = sets + meldCount;
  const need = 4 - Math.min(4, totalSets);
  const usablePartials = Math.min(partials, need);
  return (need - usablePartials) * 2 + (usablePartials > 0 ? 0 : 1);
}

/** 玩家打出的牌若 AI 能碰/杠，返回候选响应（按优先级排序） */
export function aiClaimOptions(player, tile) {
  // 红中是百搭，不能拿去碰或杠
  if (isWild(tile)) return [];
  const counts = countMap(player.hand);
  const same = counts[tile] || 0;
  const opts = [];
  if (same >= 3 && player.melds.length < 4) opts.push('gang');
  if (same >= 2 && player.melds.length < 4) opts.push('peng');
  return opts;
}

export const AI_THINK_MIN = 420;
export const AI_THINK_MAX = 980;
