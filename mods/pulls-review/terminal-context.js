// Only this run's last focused terminal per tab. Mods share one JS context, as focus.js already relies on.
import { focused, panes, spaces } from "herdr";

const recent = () => /** @type {any} */ (globalThis).t3TerminalContext ??= new Map();
export function rememberTerminal() {
  const f = focused(), all = panes();
  for (const [key, was] of recent()) if (!all.some(p => p.terminal === was.terminal && p.tab === was.tab)) recent().delete(key);
  if (f?.terminal) recent().set(`${f.space}:${f.tab}`, { ...f });
}
export function terminalFor(space = spaces().find(s => s.active)?.id, tab = spaces().find(s => s.id === space)?.tabs.find(t => t.active)?.id) {
  rememberTerminal();
  const was = recent().get(`${space}:${tab}`);
  return was && panes().some(p => p.terminal === was.terminal && p.tab === tab) ? was : null;
}

/**
 * The folder a tab works in, as T3's diff panel follows its thread's: its last focused terminal's cwd as it is now, else
 * another of its terminals', else the space's folder. Review reads the repository there; Details names it.
 */
export function workFolder(space = spaces().find(s => s.active)?.id, tab = spaces().find(s => s.id === space)?.tabs.find(t => t.active)?.id) {
  const was = terminalFor(space, tab), all = panes();
  return (was && all.find(p => p.terminal === was.terminal)?.cwd) || all.find(p => p.tab === tab && p.cwd)?.cwd
    || spaces().find(s => s.id === space)?.folder || null;
}
