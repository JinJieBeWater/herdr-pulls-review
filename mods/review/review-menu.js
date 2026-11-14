import { div, svg } from "gpui-kit";
import { v_flex, h_flex, Input } from "gpui-base";
import { settings } from "herdr";
import { subPlace } from "./submenu.js";
import { button as drawButton } from "./button.js";
import { glow } from "./tip.js";

export const PANE = "review", LU = "mods/review/icons", COMPACT = 640, MODEL_ROW = 28;
export const scopeIcons = view => `mods/${view?.scopeMod ?? PANE}/icons`;
export const zoom = () => Number(settings()?.zoom) || 1;
export const hover = t => t.foreground + "0f";

export function pickMark(t, on, view = null) {
  // The row's own colour, as T3's MenuRadioItemIndicator.
  return div().w(14).flex_none().when(on, el => el.child(svg(`${scopeIcons(view)}/check.svg`).size(14)));
}

export function searchField(t, state, view = null) {
  return h_flex().h(33).pb(6).gap(4).flex_none().items_center().border_b_1().border_color(t.border)
    .child(svg(`${scopeIcons(view)}/search.svg`).size(16).flex_none().text_color(t.dim))
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

export function iconButton(view, t, id, icon, label, action, { color, disabled, active, press } = /** @type {{ color?: any, disabled?: any, active?: any, press?: any }} */ ({})) {
  return drawButton(t, id, { icon, label, color, disabled, on: active, surface: "card", hot: view.hot === id })
    .when(!disabled, el => el.on_hover(glow(view, id)))
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); press?.(e); })
    .when(!disabled, el => el.on_click((_e, cx) => { cx.stop_propagation(); action(cx); }));
}
