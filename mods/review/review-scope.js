// What the review compares, as T3's DiffPanel header shows it: a scope button naming it, what it compares (`head → base`),
// a commit's short sha with ‹ › through its diff's commits, the scope menu, and the base picker. The menu's counts, commits
// and bases are read afresh at each opening (review-git.js, read-only, as the Review bar's); a read for a menu since closed or
// moved on is dropped. A view drawing the menu supplies two methods: `pick(page, { analyze, base, stays }, cx)` asks for that
// range (the Review page and Details each ask their own way, panel.js reviewRequest), and `openCommits(cx, lit)` opens the
// Commits submenu where that view puts it.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { shared, setShared } from "herdr";
import { scrollList, step, menuJump } from "./list.js";
import { git, readReview, readPicks, readRefs, argPage } from "./review-git.js";
import { hoverRow, subOpened, subLeft } from "./submenu.js";
import { PANE, LU, COMPACT, MODEL_ROW, pickMark, searchField, popover, toPane, subState, subAt, popupClosed } from "./review-menu.js";
import { opener } from "./trigger.js";
import { button as drawButton, ghostButton } from "./button.js";
import { menuRow, menuRule } from "./menu-row.js";
import { glow } from "./tip.js";

// A conventional commit's type and scope (`fix(t3-tabs): `), dimmed so the words after it lead.
const PREFIX = /^[a-z]+(\([^)]*\))?!?: /;
// A commit's age as the Review bar's menu reads it.
function ago(ms, now) {
  const m = Math.floor((now - ms) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.floor(m / 60)}h`;
  return `${Math.floor(m / 1440)}d`;
}
// The base each space's Changes compares to, as T3 keeps one per thread: { [space id]: ref }, a space without one on the
// default branch (Automatic).
const BASES = `${PANE}.bases`;
/** The base this space's Changes compares to, or null: the default branch. */
export const chosenBase = (view) => shared(BASES)?.[view.space] ?? null;
// A branch's Changes: against the base picked, or the default branch as the Review bar's count opens it.
export const changesPage = (base, head) => base ? argPage([`${base}...${head}`]) : argPage([], head);

// As T3's disabled menu items: there, greyed, inert.
const plural = (n, noun) => `${n} ${noun}${n === 1 ? "" : "s"}`;

// The diff's commits, oldest first: on one commit's page, still its base's.
export function diffCommits(view) { return view.baseCommits ?? (view.switching ? null : view.review?.commits) ?? []; }

// The last read of this review's repository, against the base picked now.
const repo = (view) => view.scopeRoot === view.root && view.scopeBase === chosenBase(view) ? view.scopeGit : null;

/** What the page shown compares: its kind, the button's words, and for a branch's diff its head and base. */
export function scopeOf(view) {
  const page = view.page ?? "", r = repo(view), [, kind, ...rest] = page.split("/"), value = decodeURIComponent(rest.join("/"));
  if (kind === "worktree") return { kind: "uncommitted", label: "Uncommitted" };
  if (kind === "branch") return { kind: "changes", label: "Changes", head: value, base: (!view.switching && view.review?.base?.ref) || r?.baseRef || null };
  if (kind === "commit") {
    const c = diffCommits(view).find(c => c.sha === value) ?? view.picks?.commits.find(c => c.sha === value);
    return { kind: "commit", label: c?.subject ?? ((!view.switching && view.review?.title) || value.slice(0, 7)), sha: value };
  }
  // A branch against its upstream is what there is to push or to pull, as the Review bar's arrows count them; against any
  // other base, its Changes.
  const [from, to] = value.split("...");
  if (kind === "compare" && to) {
    const push = (r && from === r.upstream && to === r.branch) || from.endsWith(`/${to}`);
    const pull = (r && from === r.branch && to === r.upstream) || to.endsWith(`/${from}`);
    return { kind: push ? "push" : pull ? "pull" : "changes", label: push ? "Outgoing" : pull ? "Incoming" : "Changes", head: to, base: from };
  }
  return { kind: "other", label: value || page };
}

/** Drops a read still out, before the menu closes or its review moves on. */
export function releaseScope(view) {
  view.scopeRead = null;
  delete view.scopeFiltered; delete view.scopeBases;
}

// Counts, commits and refs, read afresh; what comes back for a menu since closed or moved on is dropped.
function readScope(view, cx) {
  releaseScope(view);
  const { root, space } = view, base = chosenBase(view), token = {};
  view.scopeRead = token;
  const live = () => view.scopeRead === token && !view.evicted && root === view.root && space === view.space && base === chosenBase(view);
  cx.spawn(async (cx) => {
    const r = await readReview(root).catch(() => null);
    if (!live()) return;
    const ab = r && base && r.branch !== "(detached)" ? await git(root, ["rev-list", "--left-right", "--count", `${base}...HEAD`]).catch(() => null) : null;
    if (!live()) return;
    if (ab?.code === 0) r.chosen = { ref: base, unmerged: parseInt(ab.stdout.trim().split(/\s+/)[1], 10) || 0 };
    const [picks, refs] = r ? await Promise.all([readPicks(r.chosen ? { ...r, baseRef: r.chosen.ref, unmerged: r.chosen.unmerged } : r).catch(() => null), readRefs(root).catch(() => [])]) : [null, []];
    if (!live()) return;
    Object.assign(view, { scopeGit: r, picks, refs, scopeRoot: root, scopeBase: base });
    cx.notify();
  });
}

/** The menu's rows: the scopes as radios, each with its count as a number and its unit, then the submenu of commits. One
 *  checked only for the range shown (`view.page`; none before a first review). An empty one is greyed, unless it's shown. */
export function scopeRows(view) {
  const r = repo(view), p = repo(view) && view.picks, { kind } = scopeOf(view), c = r?.chosen;
  const radio = (id, k, label, count, detail, page) => ({ id, kind: k, label, count, detail: r ? detail : "", page, on: kind === k });
  const ahead = c ? c.unmerged : r?.unmerged, commits = (n) => plural(n ?? 0, "commit");
  return [
    radio("scope-changes", "changes", "Changes", ahead, c || r?.base ? commits(ahead) : "", r && (c || r.base) && changesPage(c?.ref, r.branch)),
    radio("scope-uncommitted", "uncommitted", "Uncommitted", r?.changed, plural(r?.changed ?? 0, "file"), "/worktree"),
    // Only with an upstream: there's nothing to push to or pull from without one.
    ...r?.upstream && !r.gone ? [
      radio("scope-push", "push", "Outgoing", r.ahead, commits(r.ahead), argPage([`${r.upstream}...${r.branch}`])),
      radio("scope-pull", "pull", "Incoming", r.behind, commits(r.behind), argPage([`${r.branch}...${r.upstream}`])),
    ] : [],
    { id: "scope-commits", label: "Commits", count: p?.commits.length, sub: "commits" },
  ];
}

/** The Commits submenu's rows, as its search narrows them: this branch's commits. */
export function scopeList(view) {
  const query = view.scopeSearch.value().trim().toLowerCase(), p = repo(view) && view.picks;
  if (view.scopeFiltered?.p === p && view.scopeFiltered.query === query) return view.scopeFiltered.rows;
  const rows = (p?.commits ?? []).filter(c => c.sha.startsWith(query) || c.subject.toLowerCase().includes(query))
    .map(c => ({ id: `scope-commit-${c.sha}`, page: `/commit/${c.sha}`, commit: c }));
  view.scopeFiltered = { p, query, rows };
  return rows;
}

// Another page of this diff (‹ ›): its base keeps the commits, and it has no `analyze`.
export function openReviewPage(view, page, cx) { view.pick(page, { base: view.base }, cx); }

// A radio asks as a count's click, the analysis included; Commits opens its submenu (`lit`: its row lit). The range shown
// stays pickable at nothing, to read it again.
export function pickScopeRow(view, row, cx, lit = -1) {
  if (!row.count && !row.on) return;
  if (row.sub) return view.openCommits(cx, lit);
  view.pick(row.page, { analyze: true }, cx);
}

// Browsing commits mustn't start and bill a run per pick. A commit of the diff shown, or of this branch's Changes, keeps
// that diff as its base so ‹ › step through it.
export function pickListed(view, item, cx) {
  if (!item) return;
  const r = repo(view), sha = item.commit.sha;
  const ofDiff = !view.base?.startsWith("/commit/") && diffCommits(view).some(c => c.sha === sha);
  view.pick(item.page, { base: ofDiff ? view.base : (r?.chosen ? r.chosen.unmerged : r?.unmerged) ? changesPage(r.chosen?.ref, r.branch) : undefined }, cx);
}

/** Opens the submenu `page` ("commits") beside its row, which stays lit; the keyboard is its search's. */
export function openScopePage(view, page, cx, lit = -1) {
  view.scopePage = page; view.scopeSearch.set_value(""); view.scrollTop = { ...view.scrollTop, "scope-list": 0 };
  view.scopeListAt = lit; view.scopeAt = scopeRows(view).findIndex(row => row.sub === page);
  subOpened(subState(view), page);
  view.scopeSearch.focus();
  cx.notify();
}

/** Closes the submenu, the keyboard back on the menu: by keys, on the row that opened it (`lit`); by the pointer, where it is. */
export function scopeBack(view, cx, lit = true) {
  const from = view.scopePage;
  view.scopePage = null; view.scopeSearch.set_value("");
  if (lit) view.scopeAt = scopeRows(view).findIndex(row => row.sub === from);
  subOpened(subState(view), null);
  view.handle.focus();
  cx.notify();
}

// Resting on a row opens its submenu, or closes the open one (submenu.js).
function scopeRest(view, key, e, cx) {
  hoverRow(subState(view), key, toPane(view, e), cx, (key, _row, cx) => key ? openScopePage(view, key, cx) : view.scopePage && scopeBack(view, cx, false));
}

const menuWidth = (view) => Math.min(320, view.width - 32);

/** Shared menu keys. True means scope/base owns the keyboard, including search-field typing. */
export function scopeKey(view, e, cx) {
  if (view.popup === "scope") {
    if (!view.scopePage) {
      const rows = scopeRows(view), row = rows[view.scopeAt];
      if (e.keystroke === "escape") view.closePopup(cx);
      else if (e.key === "enter" || e.key === "space" || (e.key === "right" && row?.sub)) { if (row) pickScopeRow(view, row, cx, 0); }
      else {
        const to = menuJump(view, e, rows.map(r => r.label), view.scopeAt);
        if (to < 0) return true;
        view.scopeAt = to;
      }
      cx.stop_propagation(); cx.notify();
      return true;
    }
    if (e.keystroke === "escape" || (e.key === "left" && !view.scopeSearch.value())) { scopeBack(view, cx); cx.stop_propagation(); return true; }
    const to = step(e, view.scopeListAt, scopeList(view).length);
    if (to >= 0) { view.scopeListAt = to; cx.stop_propagation(); cx.notify(); }
    return true;
  }
  if (view.popup === "base") {
    if (e.keystroke === "escape") { view.closePopup(cx); cx.stop_propagation(); return true; }
    const to = step(e, view.baseAt, baseList(view).length);
    if (to >= 0) { view.baseAt = to; cx.stop_propagation(); cx.notify(); }
    return true;
  }
  return false;
}

/** Opening the menu: nothing lit until a key or the pointer gets there (T3's menus), and its counts read afresh. */
export function openScope(view, cx) {
  view.scopePage = null; view.scopeListAt = -1; view.scopeAt = -1;
  readScope(view, cx);
}

// As the toolbar's xs ghost buttons (docs/adr/0013), its words truncating, a chevron at 70%: no fill of its own over the
// toolbar's, only hovered or while its menu is open.
function scopeButton(view, t, s) {
  return opener(view, { closed: popupClosed("scope"), onOpen: (_b, cx) => view.togglePopup("scope", cx) })(drawButton(t, "review-scope", { variant: "plain", wide: true, label: `Diff scope: ${s.label}`, size: "sm", surface: "chrome", on: view.popup === "scope", hot: view.hot === "review-scope" }).min_w(0).flex_shrink(1)
    .on_hover(glow(view, "review-scope")))
    .child(div().id("review-scope-label").min_w(0).truncate().child(s.label))
    .child(svg(`${LU}/chevron-down.svg`).size(14).flex_none().opacity(0.7));
}

/** The header's left end: the scope, a commit's sha and ‹ › within its diff, then `head → base` (narrow, `vs base`). */
export function scopeHeader(view, t, { trigger = true } = {}) {
  const s = scopeOf(view), list = diffCommits(view), at = s.sha ? list.findIndex(c => c.sha === s.sha) : -1;
  // A commit opened as its own diff, or no longer listed (as after an amend), has nowhere to step.
  const steps = s.sha && view.page !== view.base && at >= 0;
  // The Review header's 40 bar: its buttons sm on chrome (t3-tokens「规则」R2, P7).
  const go = (id, icon, label, c) => ghostButton(view, t, id, { icon, label, act: (cx) => openReviewPage(view, `/commit/${c.sha}`, cx), disabled: !c, size: "sm", surface: "chrome" });
  return h_flex().id("review-scope-row").min_w(0).gap(12).items_center()
    .when(trigger, el => el.child(scopeButton(view, t, s)))
    .when(Boolean(s.sha), el => el.child(h_flex().flex_none().gap(2).items_center()
      .child(div().id("review-sha").mr(4).text_size(12).text_color(t.dim).child(s.sha.slice(0, 7)))
      .when(steps, el => el
        .child(go("commit-older", `${LU}/chevron-left.svg`, "Older commit", list[at - 1]))
        .child(go("commit-newer", `${LU}/chevron-right.svg`, "Newer commit", list[at + 1])))))
    // As T3's refs, which drop the head below 20rem: here below COMPACT, where the header's buttons turn to icons. On Changes
    // the base is T3's comparison-target picker.
    .when(Boolean(s.head && s.base), el => el.child(h_flex().id("review-refs").min_w(0).gap(8).items_center().overflow_hidden().text_size(12).text_color(t.dim)
      .when(view.width >= COMPACT, el => el
        .child(div().id("review-ref-head").min_w(0).max_w(192).truncate().child(s.head))
        .child(svg(`${LU}/arrow-right.svg`).size(14).flex_none().opacity(0.7)))
      .when(view.width < COMPACT, el => el.child(div().id("review-ref-vs").flex_none().child("vs")))
      .when(s.kind !== "changes", el => el.child(div().id("review-ref-base").min_w(0).truncate().child(s.base)))
      .when(s.kind === "changes", el => el.child(baseButton(view, t, s)))));
}

// As T3's ComboboxTrigger there: a ghost-muted xs button, 36 to 192 wide, the ref truncating, a chevron at 70%. Its press
// notes where it is, for the popup to hang under it.
function baseButton(view, t, s) {
  return opener(view, { closed: popupClosed("base"), press: (e) => { view.baseX = toPane(view, e).bounds?.x ?? null; }, onOpen: (_b, cx) => view.togglePopup("base", cx) })(
    drawButton(t, "review-base", { wide: true, label: `Change comparison target. Currently ${s.base}`, surface: "chrome", on: view.popup === "base", hot: view.hot === "review-base" }).min_w(36).max_w(192)
      .on_hover(glow(view, "review-base")))
    .child(div().id("review-ref-base").min_w(0).truncate().child(s.base))
    .child(svg(`${LU}/chevron-down.svg`).size(14).flex_none().opacity(0.7));
}

/** The base picker's rows, as T3's buildBaseRefChoices: Automatic (unless searching), then each local branch with its
 *  remote of the same name (origin's first), then the remote-only ones, the default branch lifted first; the head itself left out. A row picks its local
 *  ref, or the remote one where that's what's picked. */
export function baseList(view) {
  const query = view.refSearch.value().trim().toLowerCase(), picked = chosenBase(view), head = scopeOf(view).head;
  const r = view.scopeRoot === view.root || view.scopeGit?.root === view.root ? view.scopeGit : null, refs = r ? view.refs : null, cached = view.scopeBases;
  if (cached && cached.refs === refs && cached.query === query && cached.picked === picked && cached.head === head && cached.repo === r) return cached.rows;
  const remotes = (refs ?? []).filter(ref => ref.remote);
  const short = (ref) => ref.name.slice(ref.remote.length + 1);
  const choices = (refs ?? []).filter(ref => !ref.remote && ref.name !== head).map(local => {
    const matches = remotes.filter(remote => short(remote) === local.name);
    const remote = matches.find(m => m.remote === "origin") ?? matches[0] ?? null;
    return { label: local.name, local: local.name, remote: remote?.name ?? null };
  });
  const paired = new Set(choices.map(c => c.remote));
  choices.push(...remotes.filter(r => !paired.has(r.name)).map(r => ({ label: r.name, local: null, remote: r.name })));
  // The default branch first, as T3's listRefs keeps it on the first page; the rest stay newest first.
  const auto = repo(view), isDefault = (c) => Boolean(auto?.base) && (c.local === auto.base || c.remote === auto.baseRef);
  choices.sort((a, b) => Number(isDefault(b)) - Number(isDefault(a)));
  const rows = [
    ...query ? [] : [{ id: "base-auto", label: "Automatic", value: null }],
    ...choices.filter(c => [c.label, c.local, c.remote].some(n => n?.toLowerCase().includes(query)))
      .map(c => ({ ...c, id: `base-${c.label}`, value: picked && picked === c.remote ? picked : c.local ?? c.remote })),
  ];
  view.scopeBases = { refs, query, picked, head, repo: r, rows };
  return rows;
}

/** Opening the picker: its refs read afresh, the search empty and focused, the picked row lit. */
export function openBase(view, cx) {
  view.refSearch.set_value("");
  view.baseAt = Math.max(0, baseList(view).findIndex(item => item.value === chosenBase(view)));
  view.refSearch.focus();
  readScope(view, cx);
}

/** Picks `value` (null: Automatic) as this space's base, and shows Changes against it; the switch's pick `stays` open, as T3's. */
export function pickBase(view, value, cx, stays = false) {
  const head = scopeOf(view).head ?? repo(view)?.branch;
  releaseScope(view);
  setShared(BASES, { ...shared(BASES), [view.space]: value });
  if (head) view.pick(changesPage(value, head), { stays }, cx);
  else if (!stays) view.closePopup(cx);
}

const BASE_W = 288; // T3's w-72

/** The base picker, as T3's ComboboxPopup: under its button, 288 wide; a search, a BRANCH / REMOTE heading, then the rows,
 *  256 tall at most. A row with a local and a remote ref has T3's switch to take the remote one; a remote-only row, a check. */
export function baseMenu(view, t) {
  const items = baseList(view), picked = chosenBase(view), height = Math.min(items.length * MODEL_ROW, 256);
  const lit = (i) => (over, cx) => { if (over && view.baseAt !== i) { view.baseAt = i; cx.notify(); } };
  const draw = (i) => {
    const item = items[i], on = item.value === picked, remote = Boolean(item.remote) && item.value === item.remote;
    return h_flex().id(item.id).h(MODEL_ROW).px(8).gap(8).flex_none().items_center().rounded(4)
      .when(i === view.baseAt, el => el.bg(t.selected)).on_hover(lit(i))
      .role("radio_button").accessibility_label(`${item.label}${on ? ", picked" : ""}`)
      .on_click((_e, cx) => pickBase(view, item.value, cx))
      .child(pickMark(t, on))
      .child(div().flex_1().min_w(0).truncate().child(item.label))
      .child(div().w(32).flex_none().flex().justify_end()
        .when(Boolean(item.local && item.remote), el => el.child(div().id(`${item.id}-remote`).w(22).h(14).p(1).flex().rounded_full()
          .bg(remote ? t.accent : t.input).when(remote, el => el.justify_end())
          .role("switch").accessibility_label(`Use remote version of ${item.label}${remote ? ", on" : ""}`)
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { cx.stop_propagation(); pickBase(view, remote ? item.local : item.remote, cx, true); })
          .child(div().size(12).rounded_full().bg(t.background))))
        .when(Boolean(item.remote) && !item.local, el => el.child(svg(`${LU}/check.svg`).size(12).text_color(t.dim))));
  };
  const x = Math.max(8, Math.min(view.baseX ?? 16, view.width - BASE_W - 8));
  return div().absolute().top(36).left(x).child(popover(view, t, "review-base-menu").w(Math.min(BASE_W, view.width - 16)).p(4)
    .child(searchField(t, view.refSearch).mx(8).mt(5))
    // As T3's: 10px, uppercase, the check's column kept.
    .child(h_flex().h(24).pl(30).pr(8).flex_none().items_center().border_b_1().border_color(t.border).text_size(10).font_medium().text_color(t.dim)
      .child(div().flex_1().child("BRANCH")).child(div().child("REMOTE")))
    .child(v_flex().flex_none().mt(4)
      .child(scrollList(view, "base-list", { count: items.length, row: MODEL_ROW, at: view.baseAt, draw, height,
        wheeled: (keep) => { if (keep >= 0) view.baseAt = keep; } }))
      .when(!items.length, el => el.child(div().id("base-none").p(8).flex_none().text_center().text_color(t.dim).child(view.refs ? "No matching refs." : "Reading…")))));
}

/** One of the scope menu's rows (scopeRows' `r`, its `i`th), as T3's MenuRadioItem and MenuSubTrigger (menu-row.js): the
 *  mark's slot kept on every row so the words line up; Commits' row stays lit while its submenu is open (`open`). `icons`: the
 *  mod's own folder, for the check. `also(row)`: the menu's own handlers (resting on Commits opens it, submenu.js). */
export function scopeRow(view, t, r, i, { icons = LU, open = false, also = undefined } = {}) {
  return menuRow(view, t, r.id, { at: [view, "scopeAt", i], label: r.label, open, lead: pickMark(t, Boolean(r.on), icons), sub: Boolean(r.sub),
    disabled: !r.count && !r.on, pick: (cx) => pickScopeRow(view, r, cx),
    trail: r.detail ? div().id(`${r.id}-detail`).flex_none().ml(16).text_size(12).text_color(t.dim).child(r.detail) : null, also })
    .role(r.sub ? "button" : "radio_button").accessibility_label(`${r.label}${r.detail ? `, ${r.detail}` : ""}${r.on ? ", shown" : ""}`);
}

/** The rows of scopeRows, the radios then a rule then Commits, each drawn by `row(r, i)`. */
export const scopeItems = (t, rows, row) => {
  const radios = rows.filter(r => !r.sub).length;
  return [...rows.slice(0, radios).map(row), menuRule(t), ...rows.slice(radios).map((r, i) => row(r, radios + i))];
};

/** Commit `i` of the Commits submenu (scopeList), as T3's: its check, its type and scope dimmed, unpushed ↑, its age. */
export function commitRow(view, t, items, i, icons = LU) {
  const item = items[i], on = item.page === view.page, c = item.commit, now = Date.now();
  const prefix = PREFIX.exec(c.subject)?.[0] ?? "", out = Boolean(view.picks?.unpushed.includes(c.sha));
  const lit = (over, cx) => { if (over && view.scopeListAt !== i) { view.scopeListAt = i; cx.notify(); } };
  return h_flex().id(item.id).h(MODEL_ROW).px(8).gap(8).flex_none().items_center().rounded(4).cursor_pointer()
    .when(i === view.scopeListAt, el => el.bg(t.selected)).on_hover(lit)
    .on_click((_e, cx) => pickListed(view, item, cx))
    .role("button").accessibility_label(`Review commit ${c.subject}${on ? ", shown" : ""}${out ? ", not pushed" : ""}`)
    .child(pickMark(t, on, icons))
    .child(h_flex().flex_1().min_w(0).gap(4)
      .when(Boolean(prefix), el => el.child(div().flex_none().text_color(t.dim).child(prefix.trim())))
      .child(div().flex_1().min_w(0).truncate().child(c.subject.slice(prefix.length))))
    .when(out, el => el.child(div().flex_none().text_size(12).text_color(t.ansi2).child("↑")))
    .when(Boolean(c.time), el => el.child(div().id(`${item.id}-time`).flex_none().text_size(12).text_color(t.dim).child(ago(c.time, now))));
}

/** The scope menu in the Review page, as T3's: radios, a rule, Commits ›, whose submenu opens beside it (scopeSub). */
export function scopeMenu(view, t) {
  const row = (r, i) => scopeRow(view, t, r, i, { open: Boolean(r.sub) && r.sub === view.scopePage,
    also: (el) => el.on_mouse_move((e, cx) => scopeRest(view, r.count ? r.sub ?? null : null, e, cx)) });
  return popover(view, t, "review-scope-menu").w(menuWidth(view)).p(4).children(scopeItems(t, scopeRows(view), row));
}

/** The open submenu of commits in the Review page, as T3's: its search on top, its list at most 320 tall, beside its row
 *  in the menu (main.js draws the menu at top 38, left 12; its rows start past its border and padding: rows of 28, a rule of 9). */
export function scopeSub(view, t) {
  const page = view.scopePage, rows = scopeRows(view), radios = rows.filter(r => !r.sub).length;
  const at = rows.findIndex(r => r.sub === page);
  const items = scopeList(view);
  const listHeight = Math.min(items.length * MODEL_ROW, Math.max(MODEL_ROW * 3, Math.min(320, view.height - 180)));
  // Its border and padding, the search and its margins, then the list or its 36 note.
  const h = 10 + 43 + (items.length ? listHeight : 36);
  const anchor = { x: 17, y: 43 + at * MODEL_ROW + (at >= radios ? 9 : 0), width: menuWidth(view) - 10, height: MODEL_ROW };
  // 384 where there's room right of the menu, else narrower down to 260 (its subjects truncate) rather than over the menu.
  const { at: box, w } = subAt(view, anchor, [260, 384], h);
  // The pointer on it: nothing pending on the menu's rows opens or closes it.
  return box.child(popover(view, t, "review-scope-sub", false).w(w).p(4).on_hover((on) => { if (on) subLeft(subState(view)); })
    .child(searchField(t, view.scopeSearch).mx(8).mt(5).mb(5))
    .child(v_flex().flex_none()
      .child(scrollList(view, "scope-list", { count: items.length, row: MODEL_ROW, at: view.scopeListAt, draw: (i) => commitRow(view, t, items, i), height: listHeight,
        wheeled: (keep) => { if (keep >= 0) view.scopeListAt = keep; } }))
      .when(!items.length, el => el.child(div().id("scope-none").p(8).flex_none().text_center().text_color(t.dim).child(view.picks ? "No matches" : "Reading…")))));
}
