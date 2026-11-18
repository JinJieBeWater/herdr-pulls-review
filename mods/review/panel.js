// The space panel (docs/adr/0012, 0017): the `panel` column at the window's right, the `panel-body` stack its render slots.
// Each space keeps `{ tabs, active, open, wide }` in t3.panels (docs/internals/storage.md); surfaces.js says what a step does
// to the tabs, this stores it and lays the panel out. Where Herdr's own layout docks the Review extra in its stack instead
// (no `panel-empty` slot), the host owns the head and these only show the page.
import { layout, run, spaces, shared, setShared, exec, window } from "herdr";
import { KEY } from "./store.js";
import { GROUP_GAP } from "./button.js";
import { workFolder } from "./terminal-context.js";
import { surfaceActivate, surfaceAdd, surfaceOpenFile, surfaceNavigate, surfaceClose } from "./surfaces.js";

/** Layout `node`'s descendant (or itself) with `id`, else null. */
export const layoutNode = (node, id) => node?.id === id ? node : (node?.children ?? []).reduce((hit, c) => hit ?? layoutNode(c, id), null);
const activeSpaceId = () => spaces().find(p => p.active)?.id;
const panelSlots = () => (layoutNode(layout(), "panel-body")?.children ?? []).map(c => c.id);
// A tab's instance name: later than any this copy gave, so a tab closed and added again in one moment is still another.
let lastBorn = 0;
const newBorn = () => (lastBorn = Math.max(Date.now(), lastBorn + 1));

/** `space`'s tabs and the active one; Review's only where the extra is installed. */
export function surfacesFor(space = activeSpaceId(), slots = panelSlots()) {
  const kept = shared(KEY.panels)?.[space], tabs = (kept?.tabs ?? []).filter(t => t.id !== "review" || slots.includes("review"));
  return { tabs, active: tabs.some(t => t.id === kept?.active) ? kept.active : tabs[0]?.id ?? null };
}

/** The instance of `space`'s `id` tab (surfaces.js `born`), or null: none, or Herdr's own stack, which has no tabs. A mod
 * stamps what it keeps or asks for a tab with it, so a tab closed and added again doesn't take the old one's. */
export function surfaceBorn(id, space = activeSpaceId()) {
  const slots = panelSlots();
  return slots.includes("panel-empty") ? surfacesFor(space, slots).tabs.find(t => t.id === id)?.born ?? null : null;
}

/** What shows: open, wide, the stack's slot (`page`) and slots; `owns` this layout's surfaces; the active space's tabs. */
export function panelState() {
  const root = layout(), panel = layoutNode(root, "panel"), body = layoutNode(root, "panel-body"), work = layoutNode(root, "work");
  const slots = (body?.children ?? []).map(c => c.id);
  return { open: Boolean(panel && !panel.hidden), page: body?.active ?? null, pages: slots, owns: slots.includes("panel-empty"),
    wide: Boolean(panel && work?.hidden), ...surfacesFor(activeSpaceId(), slots) };
}

/** The tab bar's window part (t3-tabs' `window-end` block) as it draws with the panel `open` or not, logical px: closed, the
 *  panel's 28 toggle a group's gap after Details (none at Home, as t3-tabs draws it), then the window's own buttons 8 on,
 *  three of 28; open, nothing, the panel head has them. */
export function windowEndPx(open) {
  const home = shared(KEY.home), atHome = Boolean(home) && activeSpaceId() === home;
  return open ? 0 : (panelSlots().length && !atHome ? GROUP_GAP + 28 : 0) + (window()?.buttons ? 8 + 3 * 28 : 0);
}

// The panel shown or put away, the window part sized for it in the same go: the frame that shows the change has Details and
// the toggle where they end up. t3-tabs' fit() would size it only from that frame's measure, a frame late.
function showPanel(open) {
  run(open ? "layout.show" : "layout.hide", { id: "panel" });
  if (layoutNode(layout(), "window-end")) run("layout.resize", { id: "window-end", px: windowEndPx(open) });
}

const slot = (active) => active === "review" ? "review" : active ? "files" : "panel-empty";

// The active space's record, only its fields: what an older build kept beside them goes at the first write.
function save(want) {
  const id = activeSpaceId();
  if (!id) return;
  const all = shared(KEY.panels) ?? {}, was = all[id] ?? {};
  setShared(KEY.panels, { ...all, [id]: { tabs: was.tabs ?? [], active: was.active ?? null, open: Boolean(was.open), wide: Boolean(was.wide), ...want } });
}

// A step's result shown: stored, its slot selected, the panel open. Opening the panel puts Details away (T3).
function showSurfaces(next, keepDetails = false) {
  save({ tabs: next.tabs, active: next.active, open: true });
  run("layout.select", { stack: "panel-body", child: slot(next.active) });
  showPanel(true);
  if (!keepDetails) run("t3-actions.dismiss-details", {});
}

/** A tab picked (its tab, a key): it shows and is revealed again. */
export function activateSurface(id, keepDetails = false) {
  const s = panelState();
  if (!s.tabs.some(t => t.id === id)) return false;
  showSurfaces(surfaceActivate(s, id), keepDetails);
  return true;
}

/** "files" or "review" added, or picked if it's there. In Herdr's own layout, its page shown. */
export function showPage(page, keepDetails = false) {
  const s = panelState();
  if (!s.pages.includes(page)) return false;
  if (!s.owns) { run("layout.select", { stack: "panel-body", child: page }); showPanel(true); return true; }
  showSurfaces(surfaceAdd(s, page, newBorn()), keepDetails);
  return true;
}

/** A file opened from Files: its tab, or a new one (surfaces.js openFile). Not a reveal: Files shows it itself. */
export function openFile(path) { showSurfaces(surfaceOpenFile(panelState(), path, newBorn())); }

/** A breadcrumb's folder, from the active tab (surfaces.js navigateFolder). */
export function navigateFolder(path, trail = path, keep = false) { showSurfaces(surfaceNavigate(panelState(), path, trail, keep, newBorn())); }

/** mode: "one", "others", "right", "all" (surfaces.js close). The last one gone puts the panel away. Each mod lets go of what a
 * closed tab held when its `born` is gone from the list. In Herdr's own layout, the panel goes. */
export function closeSurface(id = panelState().active, mode = "one") {
  const s = panelState();
  if (!s.owns) { hidePanel(); return; }
  const next = surfaceClose(s, id, mode);
  if (next === s) return;
  if (next.active) { showSurfaces(next); return; }
  save({ tabs: next.tabs, active: null });
  run("layout.select", { stack: "panel-body", child: "panel-empty" });
  hidePanel();
}

// Put away: the work column back if the panel had taken its place; the tabs stay.
export function hidePanel() {
  const s = panelState();
  if (s.wide) run("layout.show", { id: "work" });
  showPanel(false);
  if (s.owns) save({ open: false, wide: false });
}

/** A page's own entry: opens the panel on it, or puts away the panel already showing it. Without one: the panel as it was. */
export function togglePanel(page) {
  const s = panelState();
  if (s.open && (!page || (s.owns ? s.active : s.page) === page)) hidePanel();
  else if (page) showPage(page);
  else if (!s.owns) { if (s.page) showPage(s.page); }
  else if (s.active) activateSurface(s.active);
  else {
    run("layout.select", { stack: "panel-body", child: "panel-empty" });
    showPanel(true);
    run("t3-actions.dismiss-details", {});
    save({ open: true, wide: false });
  }
}

// The panel over the whole work area, the tab bar included, and back: for a split diff or a long file.
export function toggleWide() {
  const s = panelState();
  if (!s.open) return;
  run(s.wide ? "layout.show" : "layout.hide", { id: "work" });
  save({ wide: !s.wide });
}

// The Review extra's keys, by space id, that the layout reads: what each space's Review shows (its scope, written by Review's
// keep()) and its run's status word. Named once here, as store.js's KEY names the layout's own (an extra's aren't `t3`).
export const REVIEW_SHOWN = "review.shown", REVIEW_STATUS = "review.status";

/** What `space`'s Review shows (`review.shown`), while the tab that showed it is still there (its `born`): a closed one's is gone. */
export function reviewShown(space) {
  const shown = shared(REVIEW_SHOWN)?.[space];
  return shown && (shown.born ?? null) === surfaceBorn("review", space) ? shown : null;
}

/**
 * Asks `space`'s Review for `page` of `root` (the `review` key, docs/internals/storage.md): past the last request's number, and
 * naming the already shown Review tab (`born`), so a tab closed meanwhile doesn't take it up. For an outside pick use openReview.
 */
export function reviewRequest(space, root, page, { base = undefined, analyze = false } = {}) {
  const born = surfaceBorn("review", space);
  setShared("review", { space, root, page, ...(base ? { base } : {}), n: Math.max(Date.now(), Number(shared("review")?.n ?? 0) + 1), analyze: Boolean(analyze), ...(born != null && { born }) });
}

/** Shows a source space's selected Review range, then sends it to the tab just shown. The caller owns repository validation
 * and any popup it needs to close afterwards (`keepDetails` defers Details' dismissal to the caller). */
export function openReview({ space, root, page, base = undefined, analyze = false }, keepDetails = false) {
  if (!space || space !== activeSpaceId()) return "stale";
  if (!showPage("review", keepDetails)) return "unavailable";
  reviewRequest(space, root, page, { base, analyze });
  return "opened";
}

/**
 * Why Review can't read `space` now, or "" when it can: a space on another machine, or no Git repository where its tab works
 * (terminal-context.js workFolder: the last terminal's cwd, else the space folder), as T3's diff panel follows its thread's
 * folder. `root` is that repository, Review's default. Not installed: no Review to ask about (panelState().pages).
 * @returns {Promise<{ root: string | null, problem: string }>}
 */
export const reviewRepo = async (space = activeSpaceId()) => {
  const sp = spaces().find(s => s.id === space);
  if (!sp) return { root: null, problem: "No space is open." };
  if (sp.machine) return { root: null, problem: "Review is unavailable on remote spaces." };
  const folder = workFolder(sp.id);
  const top = folder ? await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "rev-parse", "--show-toplevel"], { cwd: folder }).catch(() => null) : null;
  const root = top?.code === 0 && top.stdout?.trim();
  return root ? { root, problem: "" } : { root: null, problem: "This tab's folder is not in a Git repository." };
};

// --- Each space keeps its panel, as T3 keeps one per thread. The width stays the window's.

const same = (a, b) => a.open === b.open && a.page === b.page && a.wide === b.wide;
// The panel as `space` left it; closed if it never had one.
function keptFor(space) {
  const kept = shared(KEY.panels)?.[space];
  return { open: Boolean(kept?.open), page: slot(surfacesFor(space).active), wide: Boolean(kept?.open && kept?.wide) };
}
function lay(want) {
  run("layout.select", { stack: "panel-body", child: want.page });
  run(want.wide ? "layout.hide" : "layout.show", { id: "work" });
  showPanel(want.open);
}

/**
 * Lays the panel out as `space` left it in the same go as the select that will show that space, so its first frame has it
 * (going Home: t3-tabs' `arrive`). Until spaces() catches up (1s at most), syncPanel leaves it be rather than recording it
 * for, or restoring, the space still listed as active.
 */
export function restorePanel(view, space) {
  const s = panelState();
  if (!s.owns) return;
  const want = keptFor(space);
  view.panelSpace = space;
  view.panelPending = { want, until: Date.now() + 1000, space };
  if (!same(want, s)) lay(want);
}

/**
 * Switching spaces shows that space's panel; whatever opens, closes or widens it is recorded. Called from render by one copy
 * that always shows (t3-tabs' `keys`); its first frame starts from what shows rather than restoring.
 */
export function syncPanel(view) {
  const s = panelState(), space = spaces().find(p => p.active);
  if (!space || !s.owns) { view.panelSpace = null; return; }
  // Laid out ahead of a select (restorePanel) that spaces() doesn't show yet.
  if (view.panelPending?.space && view.panelPending.space !== space.id && Date.now() < view.panelPending.until) return;
  if (space.id !== view.panelSpace) {
    const first = view.panelSpace == null;
    view.panelSpace = space.id; view.panelPending = null;
    const want = keptFor(space.id);
    if (!first && !same(want, s)) {
      // The layout's clicks land after this frame: until then (or until something else wins) what shows isn't a choice.
      view.panelPending = { want, until: Date.now() + 1000 };
      lay(want);
      return;
    }
  }
  if (view.panelPending) {
    if (!same(view.panelPending.want, s) && Date.now() < view.panelPending.until) return;
    view.panelPending = null;
  }
  // shortcut: a closed space's entry stays; prune by spaces() if the record ever grows noticeably.
  const kept = shared(KEY.panels)?.[space.id];
  if (Boolean(kept?.open) !== s.open || Boolean(kept?.wide) !== s.wide) save({ open: s.open, wide: s.wide });
}
