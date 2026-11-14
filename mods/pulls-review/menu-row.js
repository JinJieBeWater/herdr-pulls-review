// A popup menu's row, as T3's MenuItem (ui/menu.tsx), for every menu: docs/internals/t3-tokens.md「菜单行」. The menu keeps
// its own keys (list.js menuJump), scrolling (scrollList) and submenus (submenu.js). scripts/sync.sh copies this to the mods that use it.
import { div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { litOnHover } from "./list.js";
import { DISABLED } from "./button.js";
import { glow, tip } from "./tip.js";

export const MENU_ROW = 28;

/**
 * `at`: [state, key, i], the row's place, lit while `state[key] === i` (list.js litOnHover); `open`: its submenu is open,
 * lit too, with a chevron when `sub`. `icon`: an svg path (drawn muted) or an element, 2px into the padding and gap; `lead`:
 * an element before it that isn't an icon (a radio's check slot). `trail`: what ends the row (menuHint, a check). `color`:
 * the words' (T3's destructive). Disabled: faded, never lit or picked; its `hint` says why in tip()'s tooltip, so `view`
 * is the one whose `hot` tips follow. `also(row)` adds the menu's own handlers (a submenu's on_mouse_move) to the row.
 * @param {any} view @param {any} t @param {string} id
 * @param {{ at: [any, string, number], label: any, open?: boolean, icon?: any, lead?: any, trail?: any, color?: string, sub?: boolean,
 *   disabled?: boolean, hint?: string, pick?: (cx: any) => void, also?: (row: any) => any }} o
 */
export function menuRow(view, t, id, { at: [state, key, i], label, open = false, icon, lead, trail, color, sub = false, disabled = false, hint, pick, also }) {
  const row = h_flex().id(id).h(MENU_ROW).px(8).gap(8).flex_none().items_center().rounded(4).text_size(14).text_color(color ?? t.foreground)
    // A label that isn't words (an element) names itself: the caller sets accessibility_label.
    .role("button").when(typeof label === "string", (el) => el.accessibility_label(label))
    .when(disabled, (el) => el.opacity(DISABLED))
    .when(!disabled, (el) => el.cursor_pointer().when(state[key] === i || open, (el) => el.bg(t.selected)).on_hover(litOnHover(state, key, i))
      .when(Boolean(pick), (el) => el.on_click((_e, cx) => { cx.stop_propagation(); pick(cx); })))
    .when(Boolean(lead), (el) => el.child(lead))
    .when(Boolean(icon), (el) => el.child(div().flex_none().mx(-2).child(typeof icon === "string" ? svg(icon).size(16).text_color(t.muted) : icon)))
    .child(div().flex_1().min_w(0).truncate().child(label))
    .when(Boolean(trail), (el) => el.child(trail))
    // T3's MenuSubTrigger ends in its chevron, 80% opaque, 2px into the padding. Herdr ships it, so every mod can name it.
    .when(sub, (el) => el.child(svg("mods/workspace-chrome/chevron-right.svg").size(16).mr(-2).flex_none().text_color(t.muted).opacity(0.8)));
  const done = also ? also(row) : row;
  return disabled && hint ? tip(view, t, id, hint, done.on_hover(glow(view, id))) : done;
}

/** A row's shortcut or note at its end, as T3's MenuShortcut: 12, medium, dim. */
export const menuHint = (t, text) => div().flex_none().text_size(12).font_medium().text_color(t.dim).child(text);

/** T3's MenuSeparator. */
export const menuRule = (t) => div().h(1).mx(8).my(4).flex_none().bg(t.border);
