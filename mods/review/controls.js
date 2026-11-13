import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { settings, setShared, shared } from "herdr";
import { button as drawButton } from "./button.js";
import { PANE, LU, COMPACT, MODEL_ROW, zoom, hover, pickMark, searchField, popover, toPane, subState, subAt, iconButton } from "./review-menu.js";
export { PANE, LU, COMPACT, MODEL_ROW, zoom, hover, pickMark, searchField, popover, toPane, subState, subAt, iconButton };

// Preferences every review pane shares: a pane's localStorage is its own, so a new pane would start from the defaults.
const PREFS = `${PANE}.prefs`;
export const pref = (key) => shared(PREFS)?.[key];
export const setPref = (key, value) => setShared(PREFS, { ...shared(PREFS), [key]: value });
// The code's font, the window's terminal font: only the diff's code and hunk headers are in it.
export const mono = () => /** @type {string} */ (settings().font_family);

// A light theme takes the darker hues, as the app's `dark:` variants switch them.
export const isLight = (hex) => { const n = parseInt(String(hex).slice(1, 7), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255 > 0.5; };

// @antfu/design's opacities: op-fade for what waits for a hover, op-disabled; and its segment track and raised pill.
export const FADED = 0.65, DISABLED = 0.3;

// Responsive widths, the app's: split from SPLIT_MIN of diff (its MIN_SPLIT_WIDTH_PX; narrower, unified, the choice kept).
// Under COMPACT the header's text buttons are icons.
export const SPLIT_MIN = 640;

// The reviewed box, drawn as the app's ReviewCheckbox: checked, partly (a folder), or not. Handlers are the caller's.
// State "all", "some", "none", or "changed" (reviewed, then changed: the app's orange half mark).
export function checkMark(t, state) {
  const fill = state === "changed" ? "#f97316" : state === "none" ? null : t.accent;
  // `input` can already be translucent: dark:bg-input/32 scales that alpha instead of appending another one.
  const input = t.input.replace(/^#(.)(.)(.)$/, "#$1$1$2$2$3$3");
  const wash = input.slice(0, 7) + Math.round(parseInt(input.slice(7) || "ff", 16) * 0.32).toString(16).padStart(2, "0");
  // Unchecked, as T3's Checkbox (border-input, dark:bg-input/32): `raised` would vanish on a `selected` row.
  return div().size(16).flex_none().rounded(4).border_1().border_color(fill ?? t.input).bg(fill ?? wash)
    .flex().items_center().justify_center().text_color(state === "changed" ? "#ffffff" : t.accent_foreground)
    .when(state === "all", el => el.child(svg("mods/review/icons/check.svg").size(12)))
    .when(state === "some" || state === "changed", el => el.child(svg("mods/review/icons/minus.svg").size(12)));
}

// The pane's xs buttons; `note` stays dim after the label.
export function button(view, t, id, label, action, { color, icon, after, primary, note } = /** @type {{ color?: any, icon?: any, after?: any, primary?: boolean, note?: any }} */ ({})) {
  return drawButton(t, id, { variant: primary ? "primary" : "plain", text: label, icon, color, surface: "card", hot: view.hot === id })
    .on_hover((on, cx) => { view.hot = on ? id : null; cx.notify(); })
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).on_click((_e, cx) => { cx.stop_propagation(); action(cx); })
    .when(Boolean(note), el => el.child(div().opacity(FADED).child(note)))
    .when(Boolean(after), el => el.child(svg(after).size(14).flex_none()));
}

// As the app's DiffStats, each only when there are any, measured as T3's DiffStatLabel.
export function diffStats(t, added, deleted) {
  return h_flex().flex_none().gap(4)
    .when(added > 0, el => el.child(div().text_color(t.ansi2).child(`+${added.toLocaleString()}`)))
    .when(deleted > 0, el => el.child(div().text_color(t.ansi1).child(`-${deleted.toLocaleString()}`)));
}
