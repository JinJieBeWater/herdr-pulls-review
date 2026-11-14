// The layout's buttons, as T3's Button (`ui/button.tsx`): a variant for its colors, a size for its box, the theme for every color.
// docs/internals/t3-tokens.md「按钮」 is the table this draws. The caller adds what a button does: on_click (unless `act` is
// given), hover tracking for `hot`, stop() for the keyboard and tip() for a label. scripts/sync.sh copies this to each mod.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { glow } from "./tip.js";

// T3's sm: sizes. An outlined button's 1px border is inside its padding, as T3's `px-[calc(--spacing(3)-1px)]`.
const SIZES = {
  default: { h: 32, px: 12, gap: 8, text: 14, icon: 16, radius: 8 },
  sm: { h: 28, px: 10, gap: 6, text: 14, icon: 16, radius: 8 },
  compact: { h: 28, px: 8, gap: 4, text: 12, icon: 14, radius: 6 },
  xs: { h: 24, px: 8, gap: 4, text: 12, icon: 14, radius: 8 },
  micro: { h: 20, px: 6, gap: 4, text: 11, icon: 12, radius: 4 },
  tiny: { h: 16, px: 4, gap: 4, text: 11, icon: 12, radius: 4 },
};
// Icon-only boxes: T3's icon, icon-sm and icon-xs keep their 16/16/14 icons; micro and tiny take 12.
const ICON = { default: 16, sm: 16, compact: 14, xs: 14, micro: 12, tiny: 12 };
export const DISABLED = 0.64;

/** The radius a size draws, for the focus ring stop() draws over it. @param {string} [size] */
export const radiusOf = (size = "xs") => SIZES[size].radius;

// Ghost fills. `hover` and `selected` are the theme's tints of `chrome`; on a card or a popover `hover` can be its own color
// (catppuccin, latte), so there a tint of the text, as T3's accent: 7% hovered, 12% on, as the file tree's rows. In a sidebar
// row or card, as T3's row controls, none: it only lights. On a tab, `raised`, as T3's tab close (`bg-muted`).
/** A ghost's fill on `surface`, hovered or `on`; null on a row. For what isn't a button but lights as one (a details row). */
export const tint = (t, surface, on) => surface === "row" ? null : surface === "tab" ? t.raised
  : surface === "chrome" ? (on ? t.selected : t.hover) : t.foreground + (on ? "1f" : "12");

/**
 * @param {any} t the theme
 * @param {string} id
 * @param {{ variant?: "primary" | "outline" | "danger" | "ghost" | "plain", size?: keyof typeof SIZES, surface?: "chrome" | "card" | "row" | "tab",
 *   text?: string, icon?: string, wide?: boolean, label?: string, color?: string, hot?: boolean, on?: boolean, disabled?: boolean,
 *   act?: (cx: any) => void }} [o]
 *   `text` the words, `icon` an svg path before them (alone: a square button), `label` what assistive tech reads (else `text`).
 *   `wide`: padded as with words though there are none, for children the caller chains after (marks, counts).
 *   Ghost and plain: `color` its color whatever the state (ghost: else `dim`, `foreground` lit; plain: `foreground`), `hot` lit as hovered (an svg takes no hover style, so the caller tracks it),
 *   `on` pressed or its popup open.
 */
export function button(t, id, { variant = "ghost", size = "xs", surface = "chrome", text, icon, wide = false, label, color, hot = false, on = false, disabled = false, act } = {}) {
  // A disabled toggle isn't pressed: it draws no on fill.
  on = on && !disabled;
  const s = SIZES[size], filled = variant !== "ghost" && variant !== "plain", lit = variant === "plain" || (!disabled && (hot || on));
  // primary's border is its fill: drawn, a disabled one's faded edge shows lighter than its faded fill.
  const ruled = filled && variant !== "primary";
  const el = h_flex().id(id).h(s.h).flex_none().items_center().justify_center().rounded(s.radius).text_size(s.text).font_medium()
    .when(Boolean(text) || wide, (b) => b.px(ruled ? s.px - 1 : s.px).gap(s.gap)).when(!text && !wide, (b) => b.w(s.h))
    .when(ruled, (b) => b.border_1().border_color(t.input))
    .when(filled, (b) => b.bg(variant === "primary" ? t.solid : t.raised)
      .text_color(variant === "primary" ? t.solid_foreground : variant === "danger" ? t.ansi1 : t.foreground)
      .when(!disabled, (h) => h.hover((st) => st.opacity(0.9))))
    .when(!filled, (b) => b.text_color(color ?? (lit ? t.foreground : t.dim)).when(on && surface !== "row", (h) => h.bg(tint(t, surface, true)))
      .when(!disabled && !on && surface !== "row", (h) => h.hover((st) => st.bg(tint(t, surface, false)))))
    .when(disabled, (b) => b.opacity(DISABLED))
    .role("button").accessibility_label(label ?? text)
    .when(Boolean(act) && !disabled, (b) => b.cursor_pointer().on_click((_e, cx) => act(cx)));
  return el.when(Boolean(icon), (b) => b.child(svg(icon).size(text ? s.icon : ICON[size]).flex_none()))
    .when(Boolean(text), (b) => b.child(text));
}

/**
 * A ghost icon button on a card (or a `surface` bar), wired as every one is: hovering lights its icon (tip.js glow, as an svg takes no hover
 * style), a press stops there, a click runs `act`. `press(e)` sees the press first (where a menu hangs). The caller adds
 * stop() for the keyboard and tip() for its label.
 * @param {any} view @param {any} t @param {string} id
 * @param {{ icon: string, label: string, act: (cx: any) => void, press?: (e: any) => void, on?: boolean, disabled?: boolean, color?: string, size?: keyof typeof SIZES, surface?: "chrome" | "card" }} o
 */
export function ghostButton(view, t, id, { icon, label, act, press, on = false, disabled = false, color, size = "xs", surface = "card" }) {
  return button(t, id, { icon, label, on, disabled, color, size, surface, hot: view.hot === id })
    .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); if (!disabled) press?.(e); })
    .when(!disabled, (el) => el.on_hover(glow(view, id)).on_click((_e, cx) => { cx.stop_propagation(); act(cx); }));
}

// T3 threadDetailsPanelStyles' row: 32 high, words 13 medium, 10 in and between, radius 8.
/** A details row that isn't a split: 7% hovered, 12% `on` (its menu open); `locked` never lights. */
export function cardRow(t, id, { locked = false, on = false } = {}) {
  return h_flex().id(id).h(32).min_w(0).gap(10).px(10).items_center().rounded(8).text_size(13).font_medium().text_color(t.foreground)
    .when(on, (el) => el.bg(tint(t, "card", true)))
    .when(!locked && !on, (el) => el.hover((st) => st.bg(tint(t, "card", false))));
}

// `sm`: a header's icon-only pair, 28 high beside sm buttons, its chevron half narrower so the pair reads as one control.
// `row`: a details row, as cardRow, the chevron in a 32 slot (T3 threadDetailsPanelStyles' split).
const SPLIT = { sm: { h: 28, more: 20 }, row: { h: 32, more: 32 } };

/**
 * T3's split control (OpenInPicker, ThreadDetailsControl primary/secondary) as one ghost group on a card or a `surface` bar: nothing at rest,
 * one fill under both halves while either is hovered (7%) or its menu is open (12%), the hairline between them only then.
 * `main` and `more` add each half's children and behaviour (`el => el…`); the caller tracks `hot`, the half under the pointer
 * or the keyboard, as svg takes no hover style. `locked`: only the main half is off (its menu still says why). The chevron
 * always shows, as T3's: at rest the pair reads as a row with a menu.
 * @param {any} t @param {{ id: string, mainId: string, moreId: string, chevron: string, size?: keyof typeof SPLIT, surface?: "chrome" | "card",
 *   hot?: "main" | "more" | null, on?: boolean, disabled?: boolean, locked?: boolean, label?: string, moreLabel?: string }} o
 * @param {(el: any) => any} main @param {(el: any) => any} more
 */
export function split(t, { id, mainId, moreId, chevron, size = "sm", surface = "card", hot = null, on = false, disabled = false, locked = false, label, moreLabel }, main, more) {
  const s = SPLIT[size], row = size === "row", lit = !disabled && (on || hot === "more" || (hot === "main" && !locked));
  // A details row's half under the pointer adds its own 7% on the group's, as T3's primary/secondary (docs/internals/specs/details.md).
  const half = (hid, off, name, key) => h_flex().id(hid).h(s.h).items_center().role("button").accessibility_label(name)
    .when(off, (h) => h.opacity(DISABLED)).when(!off, (h) => h.cursor_pointer())
    .when(row && !off && hot === key, (h) => h.bg(tint(t, "card", false)));
  return h_flex().id(id).h(s.h).min_w(0).items_center().rounded(8).cursor_default()
    .when(row, (g) => g.w_full()).when(!row, (g) => g.flex_none())
    .when(lit, (g) => g.bg(tint(t, surface, on)))
    // In a row the main half takes what the chevron leaves, even wrapped (in tip()'s Popup) by the caller.
    .child(main(half(mainId, disabled || locked, label, "main").rounded_l(8)
      .when(row, (h) => h.flex_1().min_w(0).px(10).gap(10).text_size(13).font_medium().text_color(t.foreground))
      .when(!row, (h) => h.w(s.h).flex_none().justify_center())).when(row, (m) => m.flex_1().min_w(0)))
    .child(div().id(`${id}-rule`).w(1).h(16).flex_none().when(lit, (r) => r.bg(t.border)))
    .child(more(half(moreId, disabled, moreLabel, "more").w(s.more).flex_none().justify_center().rounded_r(8)
      .child(svg(chevron).size(16).flex_none().text_color(on || hot === "more" ? t.foreground : t.dim))));
}
