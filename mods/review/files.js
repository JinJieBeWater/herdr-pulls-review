import { div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { treeRows, pathEntries, treeList, treeRow, revealRow, statusBadge } from "./file-tree.js";
import { PANE, FADED, checkMark, diffStats } from "./controls.js";
import { groupStats, categoryIcon, criticalMark, donut } from "./groups.js";

/**
 * As the app's group aside at `lg`, beside the diffs: for a subgroup or a group without subgroups, its header (a subgroup's
 * parent to go back to, its icon, label and critical mark over its counts and donut) and summary; then its own files.
 */
export function aside(view, t) {
  const top = view.group(), g = view.asideGroup();
  if (!g) return div().id("review-aside");
  const parent = g === top ? null : top, stats = groupStats(view, g);
  return v_flex().id("review-aside").size_full().min_h(0).p(12).gap(12)
    .when(Boolean(parent) || !top.children.length, el => el.child(v_flex().id("aside-header").flex_none().w_full()
      .when(Boolean(parent), el => el.child(div().id("aside-parent").pb(4).pl(8).text_size(11).truncate().opacity(FADED).hover(s => s.opacity(1))
        .role("button").on_click((_e, cx) => { view.scrollToTop(0, cx); cx.notify(); }).child(`${parent?.label} ›`)))
      .child(v_flex().px(8).py(4).gap(4)
        .child(h_flex().gap(8).items_center()
          .child(categoryIcon(t, g.category, true))
          .child(div().flex_1().min_w(0).truncate().text_size(14).font_medium().child(g.label))
          .when(Boolean(g.critical), el => el.child(criticalMark(t))))
        .child(h_flex().gap(8).items_center().text_size(11)
          .child(diffStats(t, stats.added, stats.deleted))
          .child(div().opacity(FADED).child(`${stats.count} ${stats.count === 1 ? "file" : "files"}`))
          .child(donut(t, stats.progress))))
      .when(Boolean(g.summary), el => el.child(div().pb(8).pl(8).border_b(1).border_color(t.border).opacity(FADED)
        .child(TextView.markdown(`aside-summary-${g.key}`, g.summary).selectable(true).scrollable(false).text_size(12))))))
    .child(fileTree(view, t, g).flex_1().min_h(0));
}

// The group's files in the panel's file tree (file-tree.js), in the diff's order and open: the reviewed box after the
// status, three-state on a folder; a reviewed file struck through and dimmed. The file in front (`current`) is selected.
// Only the rows in view are drawn: a group runs to a thousand files, and every render would build them all.
export const TREE = "review-files";
function fileTree(view, t, g) {
  const checkbox = (id, state, label, toggle) => checkMark(t, state).id(id).role("check_box").accessibility_label(label)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); toggle(cx); });
  const rows = treeOf(view, g), ringed = view.handle.is_focused() && view.focusPath ? rows.findIndex(r => r.path === view.focusPath) : -1;
  // The file in front, wherever the list or a key put it, shows in the tree.
  if (view.revealedCurrent !== view.current) { view.revealedCurrent = view.current; if (view.current) revealRow(view, TREE, view.current); }
  const draw = (row, i) => {
    const focused = i === ringed;
    if (row.dir) {
      const files = g.files.filter(path => path.startsWith(`${row.path}/`)).map(path => view.fileAt(path)).filter(Boolean), done = files.filter(f => f.reviewed).length;
      const state = !done ? "none" : done === files.length ? "all" : "some";
      return treeRow(t, `mods/${PANE}`, row, `tree-d-${row.path}`, { focused, trailing: checkbox(`tree-dcheck-${row.path}`, state, `${row.name}: ${done} of ${files.length} reviewed`, (cx) => view.setReviewed(files, state !== "all", cx)) })
        .on_click((_e, cx) => { view.focusPath = null; toggleDir(view, row.path, cx); });
    }
    if (row.missing) return treeRow(t, `mods/${PANE}`, row, `tree-m-${row.path}`, { focused, dim: true, struck: true });
    const f = view.fileAt(row.path);
    if (!f) return div().id(`tree-f-${row.path}`);
    return treeRow(t, `mods/${PANE}`, row, `tree-f-${row.path}`, { selected: view.current === row.path, focused, status: LETTER[f.status] ?? "M", dim: f.reviewed, struck: f.reviewed,
      trailing: checkbox(`tree-check-${row.path}`, f.changed ? "changed" : f.reviewed ? "all" : "none", f.reviewed ? `${row.path}: reviewed` : `${row.path}: not reviewed`, (cx) => view.setReviewed(f, !f.reviewed, cx)) })
      .on_click((_e, cx) => { view.focusPath = null; view.select(row.path, cx); });
  };
  return treeList(view, TREE, rows, draw);
}

// The tree's rows, made again only for another group, read or folder opened or closed.
export function treeOf(view, g) {
  if (view.treeOf?.g !== g || view.treeOf.closed !== view.dirsMoved) {
    // Another group's files (applyReview drops the tree) start at their top.
    if (view.treeOf?.g.key !== g.key) view.scrollTop = { ...view.scrollTop, [TREE]: 0 };
    const kids = pathEntries([...g.files.map(path => ({ path })), ...g.missing.map(path => ({ path, missing: true }))]);
    view.treeOf = { g, closed: view.dirsMoved, rows: treeRows(rel => kids.get(rel) ?? [], path => !view.closedDirs.has(path)) };
  }
  return view.treeOf.rows;
}

export function toggleDir(view, path, cx) {
  view.closedDirs.has(path) ? view.closedDirs.delete(path) : view.closedDirs.add(path);
  view.dirsMoved = (view.dirsMoved ?? 0) + 1;
  cx.notify();
}

// A change's letter, as the app's FileStatus.
const LETTER = { added: "A", removed: "D", modified: "M", renamed: "R", copied: "C" };
export const fileStatus = (status) => statusBadge(LETTER[status] ?? "M");
