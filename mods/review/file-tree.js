// The space panel's file tree, one for the Files and Review pages (docs/adr/0013): T3's Pierre tree at its compact density.
// The rows as data (treeRows, pathEntries, rowAt, treeKey) and one row drawn (treeRow); scripts/sync.sh copies this, with
// list.js and file-icons.js, to both mods.
import { div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { scrollList } from "./list.js";
import { fileIcon, folderIcon } from "./file-icons.js";

// Pierre's compact density (factor 0.8): a 24 row; a level is its gap, the icon and the row's gap.
export const TREE_ROW = 24;
const PAD = 6.4, GAP = 4.8, LEVEL = 6.4 + 16 + GAP;
const CLEAR = "#00000000";
// A change's letter in its status's color, as T3's FileStatus.
export const STATUS = { A: "#22c55e", D: "#ef4444", M: "#f59e0b", R: "#3b82f6", C: "#3b82f6" };

// Names as people read them, case aside, digit runs by value. Keys are made once per entry: regexes per comparison exceed
// Herdr's script budget on a folder of 12k entries. shortcut: digit runs past 16 digits compare as text; pad more if needed.
const sortKey = (name) => name.toLowerCase().replace(/\d+/g, (d) => d.padStart(16, "0"));
const keyed = (x, y, a, b) => x < y ? -1 : x > y ? 1 : a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
export const naturalCompare = (a, b) => keyed(sortKey(a), sortKey(b), a, b);
/** Folders before files, each by its natural name. */
export function sortEntries(entries) {
  return entries.map((e) => ({ e, k: sortKey(e.name) }))
    .sort((p, q) => Number(q.e.dir) - Number(p.e.dir) || keyed(p.k, q.k, p.e.name, q.e.name)).map((p) => p.e);
}

/**
 * The tree as rows, top to bottom. `childrenOf(folder)` gives a folder's entries in order ({ name, dir, path? } and anything
 * else, kept on the row; "" is the top); `isOpen(path)` whether a folder shows them. An open folder holding just one
 * folder is one row with it, `a / b / c`, as Pierre flattens them: the row is the last's (its path, its open), `top` the first's.
 * An entry with `flat: false` (a Review group) is never joined to another.
 */
export function treeRows(childrenOf, isOpen, flattenClosed = false) {
  const out = [];
  const walk = (rel, depth, parents = []) => {
    for (const e of childrenOf(rel)) {
      const top = e.path ?? (rel ? `${rel}/${e.name}` : e.name);
      let path = top, name = e.name, last = e, opened = isOpen(top);
      for (let kids; last.dir && last.flat !== false && (isOpen(path) || flattenClosed) && (kids = childrenOf(path)).length === 1 && kids[0].dir && kids[0].flat !== false;) {
        last = kids[0]; name += ` / ${last.name}`; path = last.path ?? `${path}/${last.name}`;
        opened = opened && isOpen(path);
      }
      const open = Boolean(e.dir) && opened;
      out.push({ ...last, path, top, name, depth, open, parents });
      if (open) walk(path, depth + 1, [...parents, path]);
    }
  };
  walk("", 0);
  return out;
}

/** Paths ({ path } and anything else) as treeRows' folders: each folder's entries in the order their paths first come. */
export function pathEntries(leaves) {
  const kids = new Map([["", []]]);
  for (const leaf of leaves) {
    const parts = leaf.path.split("/");
    for (let i = 1; i < parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      if (kids.has(path)) continue;
      kids.set(path, []);
      kids.get(parts.slice(0, i - 1).join("/")).push({ name: parts[i - 1], dir: true, path });
    }
    kids.get(parts.slice(0, -1).join("/")).push({ ...leaf, name: parts.at(-1), dir: false });
  }
  return kids;
}

/** The row showing `path`: its own, or the flattened row it's a folder of. -1 if none does. */
export function rowAt(rows, path) {
  return rows.findIndex((r) => r.path === path || (r.path.startsWith(`${path}/`) && `${path}/`.startsWith(`${r.top}/`)));
}

/** Build once with the rows, not during every repaint: focus lookup and the expand-all button's state. */
export function treeIndex(rows) {
  const at = new Map();
  let folders = 0, expandable = 0, open = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    at.set(row.path, i);
    if (row.dir) { folders++; if (!row.ignored) { expandable++; if (row.open) open++; } }
    for (let path = row.top; path && path !== row.path;) {
      at.set(path, i);
      const slash = row.path.indexOf("/", path.length + 1);
      path = slash < 0 ? row.path : row.path.slice(0, slash);
    }
  }
  return { at, folders, allExpanded: expandable > 0 && expandable === open };
}

/**
 * Pierre's keys from row `at` (-1: none yet): ↑/↓ move, Home/End to the ends, → opens a folder or goes into it, ← closes
 * one or goes to the folder above, Enter picks. `{ at }` to move to, `{ toggle }` or `{ pick }` a row, or null.
 */
export function treeKey(key, rows, at) {
  const n = rows.length, row = rows[at];
  if (!n) return null;
  if (key === "down") return { at: Math.min(n - 1, at + 1) };
  if (key === "up") return { at: Math.max(0, at - 1) };
  if (key === "home") return { at: 0 };
  if (key === "end") return { at: n - 1 };
  if (!row) return null;
  if (key === "enter" || key === "space") return { pick: row };
  if (key === "right") return row.dir && !row.open ? { toggle: row } : at < n - 1 ? { at: at + 1 } : null;
  if (key === "left") {
    if (row.dir && row.open) return { toggle: row };
    for (let i = at - 1; i >= 0; i--) if (rows[i].depth < row.depth) return { at: i };
  }
  return null;
}

// A row asked to show is brought into view once the list is measured, then left where the wheel puts it.
/** @param {any} view @param {string} id */
export const revealRow = (view, id, path) => { view.treeReveal = { ...view.treeReveal, [id]: path }; };

/** The rows in a list that draws only those in view; `draw(row, i)` makes one, handlers and all. */
export function treeList(view, id, rows, draw) {
  const want = view.treeReveal?.[id], at = want == null ? -1 : rowAt(rows, want);
  if (at >= 0 && view.listHeight?.[id] !== undefined) view.treeReveal = { ...view.treeReveal, [id]: undefined };
  return scrollList(view, id, { count: rows.length, row: TREE_ROW, at, draw: (i) => draw(rows[i], i), wheeled: () => {} });
}

/**
 * One row, as Pierre's: a level's indent, a folder's chevron, the page's own `leading` (Review's reviewed box), the icon, the
 * name, then a change's letter and the page's own `trailing`. Selected on the text color at 12%, hovered at 7%; the row the keys are on ringed. `mod` is the mod's folder,
 * whose icons/ hold the chevrons and file-icons.js's; `icon`, a 16 element, stands in for the file or folder icon.
 */
/** @param {any} t @param {string} mod @param {any} row @param {string} id @param {{ selected?: boolean, focused?: boolean, context?: boolean, guides?: boolean, status?: string, dim?: boolean, struck?: boolean, leading?: any, trailing?: any, icon?: any }} options */
export function treeRow(t, mod, row, id, { selected = false, focused = false, context = false, guides = false, status, dim = false, struck = false, leading, trailing, icon } = {}) {
  // Review's reviewed box keeps its extra chevron lane; Pierre's plain Files row has only one icon lane.
  const decorated = Boolean(leading), indent = decorated ? row.depth * LEVEL : row.depth ? 19.2 + (row.depth - 1) * 18.7 : 0;
  return h_flex().id(id).relative().h(TREE_ROW).mx(decorated ? 2 : 1.6).pl(PAD + indent).pr(PAD).gap(GAP).items_center().rounded(6).text_size(12).cursor_pointer()
    .when(decorated, el => el.border_1().border_color(focused ? t.accent : CLEAR))
    .when(!decorated && focused, el => el.child(div().absolute().inset_0().rounded(6).border_1().border_color(t.accent)))
    .when(selected, (el) => el.bg(t.foreground + "1f")).when(!selected, (el) => el.hover((s) => s.bg(t.foreground + "12")))
    .when(context && !selected, el => el.bg(t.foreground + "12"))
    .when(decorated || Boolean(row.dir), el => el.child(div().size(16).flex_none().flex().items_center().justify_center()
      .when(Boolean(row.dir), (el) => el.child(row.chevron ?? svg(`${mod}/icons/chevron-${row.open ? "down" : "right"}.svg`).size(decorated ? 12 : 16).text_color(t.dim)))))
    .when(Boolean(leading), (el) => el.child(leading))
    .when(decorated || !row.dir, el => el.child((icon ?? image(`${mod}/${row.dir ? folderIcon(row.path, row.open) : fileIcon(row.path)}`).size(16).flex_none()).when(dim, (el) => el.opacity(0.5))))
    .child(div().flex_1().min_w(0).truncate().when(dim, (el) => decorated ? el.opacity(0.5) : el.text_color(t.dim)).when(struck, (el) => el.line_through()).child(row.label ?? row.name))
    .when(Boolean(status), (el) => el.child(statusBadge(status)))
    .when(Boolean(trailing), (el) => el.child(trailing))
    .when(guides && !decorated, el => el.children(Array.from({ length: row.depth }, (_, level) => div().absolute().top(0).bottom(0).left(PAD + 7.5 + level * 18.7).w(1).bg(t.foreground + "24"))));
}

// The letter in its status's color, on a tenth of it; T3's sm Badge.
export function statusBadge(letter) {
  const color = STATUS[letter] ?? STATUS.M;
  return div().h(16).min_w(16).px(3).flex_none().flex().items_center().justify_center().rounded(4).font_medium().text_size(10).text_color(color).bg(color + "1a").child(letter);
}
