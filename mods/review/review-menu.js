import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { settings } from "herdr";
import { subPlace } from "./submenu.js";

export const PANE = "review", LU = "mods/review/icons", COMPACT = 640, MODEL_ROW = 28;
export const zoom = () => Number(settings()?.zoom) || 1;
// Stamped as the Review page's popover `name` closes to a press outside it, for the button that opened it (trigger.js); another's
// button still opens its own. One key for every Review tab: two presses 50 ms apart in two of them can't both be on a button.
export const popupClosed = (name) => `${PANE}.${name}Closed`;

// `icons`: the drawing mod's own folder, as a mod draws only its own icons.
export function pickMark(t, on, icons = LU) {
  // The row's own colour, as T3's MenuRadioItemIndicator.
  return div().w(14).flex_none().when(on, el => el.child(svg(`${icons}/check.svg`).size(14)));
}

export function searchField(t, state, icons = LU) {
  return h_flex().h(33).pb(6).gap(4).flex_none().items_center().border_b_1().border_color(t.border)
    .child(svg(`${icons}/search.svg`).size(16).flex_none().text_color(t.dim))
    .child(Input.new(state).flex_1().h_full().text_size(14).text_color(t.foreground));
}

export function popover(view, t, id, closes = true) {
  return v_flex().id(id).rounded(8).bg(t.popover).border_1().border_color(t.border).text_size(14).shadow_lg()
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .on_scroll_wheel((_e, cx) => cx.stop_propagation())
    .when(closes, el => el.on_mouse_down_out((e, cx) => { if (!inSub(view, e)) view.closePopup(cx, true); }));
}

export function toPane(view, e) {
  const z = zoom(), o = view.paneAt ?? { x: 0, y: 0 }, b = e.bounds;
  return { position: { x: (e.position.x - o.x) / z, y: (e.position.y - o.y) / z },
    bounds: b && { x: (b.x - o.x) / z, y: (b.y - o.y) / z, width: b.width / z, height: b.height / z } };
}

function inSub(view, e) {
  const r = view.subRect, p = r && toPane(view, e).position;
  return Boolean(r) && p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export const subState = view => (view.subHover ??= {});

export function subAt(view, row, [min, max], h) {
  const side = subPlace(row, max, 0, view.width).side, room = side === "right" ? view.width - 8 - (row.x + row.width) : row.x - 8;
  const w = Math.min(max, Math.max(min, room), view.width - 16), p = subPlace(row, w, 0, view.width);
  const x = Math.max(8, Math.min(p.x, view.width - w - 8)), y = Math.max(8, Math.min(p.y, view.height - h - 8));
  view.subRect = { x, y, width: w, height: h };
  Object.assign(subState(view), { sub: view.subRect, side: p.side });
  return { at: div().id("review-sub-at").absolute().left(x).top(y), w };
}
