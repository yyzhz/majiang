// ============================================================================
// 牌面渲染组件：牌、牌背、副露组
// ============================================================================
import { tileName, CN_NUM, HONORS } from './mahjong.js';

const SUIT_CHAR = ['萬', '餅', '條'];

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function faceHTML(code) {
  if (code >= 27) {
    const ch = HONORS[code - 27];
    const color = ch === '中' ? 'is-red' : ch === '发' ? 'is-green' : 'is-blue';
    return `<span class="tile-honor ${color}">${ch}</span>`;
  }
  const suit = Math.floor(code / 9);
  const num = code % 9;
  const colorCls = suit === 0 ? 'is-red' : suit === 1 ? 'is-blue' : 'is-green';
  return (
    `<span class="tile-num ${colorCls}">${CN_NUM[num]}</span>` +
    `<span class="tile-suit ${colorCls}">${SUIT_CHAR[suit]}</span>`
  );
}

/**
 * @param {number} code 牌编码
 * @param {{className?:string, extraClass?:string, title?:string, selected?:boolean, dim?:boolean, badge?:string}} opts
 */
export function tileHTML(code, opts = {}) {
  const {
    className = '',
    extraClass = '',
    title = tileName(code),
    selected = false,
    dim = false,
    badge = ''
  } = opts;
  const cls = [
    'tile',
    className,
    extraClass,
    selected ? 'is-selected' : '',
    dim ? 'is-dim' : ''
  ]
    .filter(Boolean)
    .join(' ');
  const badgeHTML = badge ? `<span class="tile-badge">${escapeHtml(badge)}</span>` : '';
  return `<div class="${cls}" data-tile="${code}" title="${escapeHtml(title)}">${faceHTML(code)}${badgeHTML}</div>`;
}

export function backHTML(count = 1, className = '') {
  return new Array(count)
    .fill(0)
    .map(() => `<div class="tile tile--back ${className}"></div>`)
    .join('');
}

/** 副露：碰 / 杠（明杠、暗杠、补杠）/ 吃 */
export function meldHTML(meld, opts = {}) {
  const { mini = true, lastTile = -1 } = opts;
  const tiles = meld.tiles || [];
  const isGang = meld.type === 'gang';
  const isConcealed = isGang && meld.gangKind === 'an';
  const kindLabel = meld.type === 'peng' ? '碰' : isGang ? (isConcealed ? '暗杠' : meld.gangKind === 'bu' ? '补杠' : '明杠') : '吃';

  const body = tiles
    .map((t, i) => {
      if (isConcealed && (i === 0 || i === 3)) {
        return `<div class="tile tile--back tile--mini" title="暗牌"></div>`;
      }
      return tileHTML(t, {
        className: mini ? 'tile--mini' : '',
        title: tileName(t),
        extraClass: i === lastTile ? 'tile--claim' : ''
      });
    })
    .join('');

  return `<div class="meld-group" data-meld-type="${meld.type}" title="${kindLabel}">
    <span class="meld-label">${kindLabel}</span>
    <div class="meld-tiles">${body}</div>
  </div>`;
}
