// The Review settings' submenu (settings.js settingsSub): its rows are menu rows (menu-row.js), lit by the pointer or the keys
// and put out when the pointer leaves, as t3-tokens「菜单行」. Real openPage, settingsSub, list.js and menu-row.js; a fake kit.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");


// ---- fake kit: keeps handlers, children, style, id ------------------------------------------------
const all = [];
function element(kind = "div") {
  const node = { kind, ids: [], kids: [], handlers: {}, style: {}, text: null };
  all.push(node);
  const proxy = new Proxy(node, { get(target, key) {
    if (key in target) return target[key];
    return (...args) => {
      if (key === "when") { if (args[0]) args[1](proxy); }
      else if (key === "id") target.ids.push(args[0]);
      else if (key === "children") target.kids.push(...args[0].filter(Boolean));
      else if (key === "child") target.kids.push(args[0]);
      else if (key === "content") target.kids.push(args[0]);
      else if (typeof args[0] === "function" && /^on_/.test(key)) target.handlers[key] = args[0];
      else if (/^(bg|opacity|text_color|h|w)$/.test(key)) target.style[key] = args[0];
      return proxy;
    };
  } });
  return proxy;
}
const draw = (kind) => () => element(kind);
const byId = (node, id) => node?.ids?.includes(id) ? node : node?.kids?.map((k) => byId(k, id)).find(Boolean);

// ---- real modules, imports stripped --------------------------------------------------------------
const load = (...files) => files.map((f) => fs.readFileSync(path.join(__dirname, f), "utf8"))
  .join("\n").replace(/^import [^;]*;\r?\n/gm, "").replace(/^export /gm, "");

const state = {};
let listDraw = null, notified = 0;
const context = {
  div: draw(), h_flex: draw(), v_flex: draw(), svg: draw("svg"), image: draw("img"),
  Switch: { new: () => element("switch") },
  exec: async () => "", window: () => ({ platform: "macos" }),
  shared: (k) => state[k], setShared: (k, v) => { state[k] = v; },
  settings: () => ({ zoom: 1 }), props: () => ({}), closeOverlay: () => {},
  Date, Math, JSON, console, DISABLED: 0.64, glow: () => () => {}, tip: (_v, _t, _id, _label, el) => el,
  // controls.js / store.js / submenu.js / daemon.js: only what settings.js calls, stubbed, except MODEL_ROW and BELOW.
  PANE: "review", MODEL_ROW: 28, SPLIT_MIN: 400, BELOW: 32 / 2 + 28 / 2 + 4, LU: 1, COMPACT: 1, zoom: () => 1,
  pref: () => undefined, setPref: () => {},
  pickMark: () => element(), searchField: () => element(),
  popover: (_view, _t, id) => { const el = element("popover"); el.ids.push(id); return el; },
  toPane: (_view, e) => ({ position: e.position, bounds: e.bounds }),
  subState: (view) => (view.subHover ??= {}), subLeft: () => {}, subOpened: () => {},
  subAt: (_view, _row, _max, _h) => ({ at: element(), w: 320 }),
  hoverRow: () => {}, wrapLines: () => false, setWrapLines: () => {}, request: async () => ({}),
  localStorage: { getItem: () => null, setItem: () => {} },
};
context.globalThis = context;
const vm = require("node:vm");
vm.createContext(context);
vm.runInContext(load("list.js", "menu-row.js", "settings.js")
  + "\nglobalThis.list = { litOnHover, scrollList };\nglobalThis.settingsPage = { openPage, settingsSub, pageRows, models, locale };", context);
const { openPage, settingsSub, pageRows, models, locale } = context.settingsPage;
const { litOnHover } = context.list;   // the real one menuRow uses
// The real scrollList (extras/mods/review/list.js, a copy of shared/list.js) draws the rows; keep its draw for this render.
{
  const real = context.list.scrollList;
  context.scrollList = (view, id, o) => { listDraw = o.draw; return real(view, id, o); };
}

const t = { selected: "SELECTED", border: "#333", dim: "#555", foreground: "#eee", input: "#111", accent: "#08f", background: "#000", muted: "#777", popover: "#222" };
const cx = { notified: 0, notify() { notified++; }, stop_propagation() {}, timer: { after: (_ms, f) => f(cx), every: () => ({ cancel() {} }) }, spawn: () => {} };

const agents = [
  { name: "claude", label: "Claude", version: "1.2", models: [{ id: "m1", name: "Model 1" }] },
  { name: "codex", label: "Codex", version: "0.9", models: [] },
  { name: "gemini", label: "Gemini", version: "2.0", models: [] },
];
const view = {
  height: 800, width: 420, navBox: {}, subHover: {}, settingsError: null, agents,
  shared: { llm: { provider: "local-agent", agent: "claude", agentModel: "" } },
  modelInput: { value: () => "", set_value: () => {} },
  handle: { focus: () => {} }, paneAt: { x: 0, y: 0 }, settingsPage: null, pageAt: -1,
};
view.models = () => models(view); view.pageRows = () => pageRows(view); view.locale = () => locale(view);

// The submenu as it is drawn now: its rows by index, from settingsSub's own draw callback.
function rowsNow() {
  settingsSub(view, t);
  const n = view.pageRows().length;
  return Array.from({ length: n }, (_, i) => listDraw(i));
}
const rowBg = (i) => rowsNow()[i].style.bg;

// Real path: the panel's "Agent" row opens its submenu (openPage), then the pointer enters row 2 and leaves it.
openPage(view, "agent", cx, { x: 300, y: 200, width: 310, height: 28 });
assert.equal(view.settingsPage, "agent", "openPage opened the Agent submenu");
assert.equal(view.pageAt, -1, "opened by pointer: nothing lit");
assert.equal(rowBg(2), undefined, "no row lit yet");

rowsNow()[2].handlers.on_hover(true, cx);
assert.equal(view.pageAt, 2, "the pointer entered row 2: it lights");
assert.equal(rowBg(2), "SELECTED", "row 2 drawn with selected");

rowsNow()[2].handlers.on_hover(false, cx);   // the pointer left row 2: the host's leave
assert.equal(view.pageAt, -1, "leaving row 2 puts it out (list.js litOnHover)");
assert.equal(rowBg(2), undefined, "row 2 no longer drawn lit");
// So ↑/↓ start from the submenu's own choice, not the row the pointer left.
const state2 = { pageAt: -1 };
litOnHover(state2, "pageAt", 2)(true, cx); litOnHover(state2, "pageAt", 2)(false, cx);
assert.equal(state2.pageAt, -1, "the same rule as every menu row");
// T3's menu row: 28 high, 14px words (t3-tokens「菜单行」).
assert.deepEqual([rowsNow()[0].style.h], [28]);
console.log("ok: Review settings submenu rows light and go out as menu rows");
