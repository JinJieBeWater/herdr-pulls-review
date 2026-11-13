// One space's surfaces (ADR 0017). Stack children are render slots, not fixed user-visible pages.
import { layout, run, spaces, shared, setShared } from "herdr";
import { KEY } from "./store.js";

const find = (node, id) => node?.id === id ? node : (node?.children ?? []).reduce((hit, c) => hit ?? find(c, id), null);

export function surfaceKey(e, cx) {
  if (e.keystroke === "cmd-t" && panelState().pages.includes("panel-empty")) run("t3-tabs.surface-menu");
  else if (e.keystroke === "cmd-w") closeSurface();
  else return false;
  cx.stop_propagation(); return true;
}

export function surfacesFor(space = spaces().find(p => p.active)?.id) {
  const kept = shared(KEY.panels)?.[space];
  // Upgrade the old page once, without keeping the old two-page mode.
  const pages = find(layout(), "panel-body")?.children ?? [];
  const tabs = (kept?.tabs ?? (kept?.page && kept.page !== "panel-empty" ? [{ id: kept.page, born: "legacy" }] : []))
    .filter(t => t.id !== "review" || pages.some(p => p.id === "review"));
  return { tabs, active: tabs.some(t => t.id === kept?.active) ? kept.active : tabs[0]?.id ?? null, selected: kept?.selected };
}

export function panelState() {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body"), work = find(root, "work");
  return { open: Boolean(panel && !panel.hidden), page: body?.active ?? null, pages: (body?.children ?? []).map(c => c.id), wide: Boolean(panel && work?.hidden), ...surfacesFor() };
}

const slot = (active, pages) => active === "review" ? "review" : active ? "files" : pages.includes("panel-empty") ? "panel-empty" : "files";

function save(want) {
  const id = spaces().find(p => p.active)?.id;
  if (!id) return;
  const all = shared(KEY.panels) ?? {};
  setShared(KEY.panels, { ...all, [id]: { ...all[id], ...want } });
}

export function activateSurface(id, keepDetails = false) {
  const s = panelState();
  if (!s.tabs.some(t => t.id === id)) return false;
  save({ tabs: s.tabs, active: id, selected: `${Date.now()}-${Math.random()}`, open: true, wide: s.wide });
  run("layout.select", { stack: "panel-body", child: slot(id, s.pages) });
  run("layout.show", { id: "panel" });
  if (!keepDetails) run("t3-actions.dismiss-details", {});
  return true;
}

export function showPage(page, keepDetails = false) {
  if (!panelState().pages.includes(page)) return false;
  const s = panelState();
  // The standalone Review also docks in Herdr's own stack, whose header is owned by the host, not this layout.
  if (!s.pages.includes("panel-empty")) {
    run("layout.select", { stack: "panel-body", child: page }); run("layout.show", { id: "panel" }); return true;
  }
  if (!s.tabs.some(t => t.id === page)) save({ tabs: [...s.tabs, { id: page, born: `${Date.now()}-${Math.random()}` }] });
  return activateSurface(page, keepDetails);
}

export function openFile(path) {
  const s = panelState(), id = `file:${path}`, exists = s.tabs.some(t => t.id === id);
  const tab = { id, path, born: `${Date.now()}-${Math.random()}` };
  const tabs = s.tabs.flatMap(t => t.id === id && t.folder ? [{ id: t.id, path, born: t.born }] : t.id !== "files" ? [t] : exists ? [] : [tab]);
  if (!exists && !s.tabs.some(t => t.id === "files")) tabs.push(tab);
  save({ tabs });
  activateSurface(id);
}

/** Directory crumbs keep their source file; subsequent directory navigation replaces only that directory surface. */
export function navigateFolder(path, trail = path, keepSource = false) {
  const s = panelState(), id = path ? `file:${path}` : "files", exists = s.tabs.some(t => t.id === id && t.id !== s.active);
  const tab = { id, ...(path ? { path } : {}), folder: true, ...(trail !== path ? { trail } : {}), born: `${Date.now()}-${Math.random()}` };
  const tabs = s.tabs.flatMap(t => t.id === s.active ? [...(keepSource ? [t] : []), ...(!exists ? [tab] : [])]
    : !exists && path && t.id === "files" ? [] : [t]);
  save({ tabs }); activateSurface(id);
}

/** mode: one, others, right, all. One atomic update avoids flashing the empty surface during bulk close. */
export function closeSurface(id = panelState().active, mode = "one") {
  const s = panelState(), at = s.tabs.findIndex(t => t.id === id);
  if (!s.pages.includes("panel-empty")) { hidePanel(); return; }
  if (at < 0) return;
  const tabs = s.tabs.filter((t, i) => mode === "all" ? false : mode === "others" ? t.id === id : mode === "right" ? i <= at : t.id !== id);
  if (s.tabs.some(t => t.id === "review") && !tabs.some(t => t.id === "review")) {
    const space = spaces().find(p => p.active)?.id, shown = { ...(shared("review.shown") ?? {}) };
    delete shown[space]; setShared("review.shown", shown);
    if (shared("review")?.space === space) setShared("review", null);
  }
  const old = s.tabs.findIndex(t => t.id === s.active);
  const active = tabs.some(t => t.id === s.active) ? s.active : (s.tabs.slice(old + 1).find(t => tabs.includes(t)) ?? tabs.at(-1))?.id ?? null;
  save({ tabs, active });
  if (active) activateSurface(active);
  else { run("layout.select", { stack: "panel-body", child: slot(null, s.pages) }); hidePanel(); }
}

// Closing it gives the work column back, if the panel had taken its place.
export function hidePanel() {
  const s = panelState();
  if (s.wide) run("layout.show", { id: "work" });
  run("layout.hide", { id: "panel" });
  if (s.pages.includes("panel-empty")) save({ tabs: s.tabs, active: s.active, open: false, wide: false });
}

/** A page's own entry: opens the panel on it, or closes the panel already showing it. Without a page, the panel on its last one. */
export function togglePanel(page) {
  const s = panelState();
  if (s.open && (!page || s.active === page)) hidePanel();
  else if (page) showPage(page);
  else if (!s.pages.includes("panel-empty") && s.page) showPage(s.page);
  else if (s.active) activateSurface(s.active);
  else {
    run("layout.select", { stack: "panel-body", child: slot(null, s.pages) });
    run("layout.show", { id: "panel" });
    run("t3-actions.dismiss-details", {});
    save({ tabs: s.tabs, active: null, open: true, wide: false });
  }
}

// The panel over the whole work area, the tab bar included, and back: for a split diff or a long file.
export function toggleWide() {
  const s = panelState();
  if (!s.open) return;
  run(s.wide ? "layout.show" : "layout.hide", { id: "work" });
  save({ wide: !s.wide });
}

const same = (a, b) => Boolean(a) && a.open === b.open && a.page === b.page && a.wide === b.wide;

// The panel as `space` left it, in this layout's pages; closed if it never had one.
function keptFor(space, s) {
  const kept = (/** @type {Record<string, any>} */ (shared(KEY.panels) ?? {}))[space];
  return { open: Boolean(kept?.open), page: slot(surfacesFor(space).active, s.pages), wide: Boolean(kept?.open && kept?.wide) };
}

function lay(want) {
  run("layout.select", { stack: "panel-body", child: want.page });
  run(want.wide ? "layout.hide" : "layout.show", { id: "work" });
  run(want.open ? "layout.show" : "layout.hide", { id: "panel" });
}

/**
 * Lays the panel out as `space` left it in the same go as the select that will show that space, so its first frame has it
 * (going Home: t3-tabs' `arrive`). Until spaces() catches up (1s at most), syncPanel leaves it be rather than recording it
 * for, or restoring, the space still listed as active.
 */
export function restorePanel(view, space) {
  const s = panelState();
  if (!s.pages.length) return;
  const want = keptFor(space, s);
  view.panelSpace = space;
  view.panelPending = { want, until: Date.now() + 1000, space };
  if (!same(want, { open: s.open, page: s.page, wide: s.wide })) lay(want);
}

/**
 * Each space keeps its panel, as T3 keeps one per thread: switching shows that space's (closed if it never had one), and whatever
 * opens, closes, pages or widens it is recorded. The width stays the window's. Called from render by one copy that always shows
 * (t3-tabs' `keys`); its first frame starts from what shows rather than restoring.
 */
export function syncPanel(view) {
  const s = panelState(), space = spaces().find(p => p.active);
  if (!space || !s.pages.length) { view.panelSpace = null; return; }
  // Laid out ahead of a select (restorePanel) that spaces() doesn't show yet.
  if (view.panelPending?.space && view.panelPending.space !== space.id && Date.now() < view.panelPending.until) return;
  const now = { open: s.open, page: s.page, wide: s.wide };
  if (space.id !== view.panelSpace) {
    const first = view.panelSpace == null;
    view.panelSpace = space.id; view.panelPending = null;
    const want = keptFor(space.id, s);
    if (!first && !same(want, now)) {
      // The layout's clicks land after this frame: until then (or until something else wins) what shows isn't a choice.
      view.panelPending = { want, until: Date.now() + 1000 };
      lay(want);
      return;
    }
  }
  if (view.panelPending) {
    if (!same(view.panelPending.want, now) && Date.now() < view.panelPending.until) return;
    view.panelPending = null;
  }
  // shortcut: a closed space's entry stays; prune by spaces() if the record ever grows noticeably.
  const all = /** @type {Record<string, any>} */ (shared(KEY.panels) ?? {});
  if (!same(all[space.id], now)) setShared(KEY.panels, { ...all, [space.id]: { ...all[space.id], ...surfacesFor(space.id), ...now } });
}
