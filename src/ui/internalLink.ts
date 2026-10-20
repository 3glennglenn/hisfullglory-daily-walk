import type { MouseEvent } from "react";
import { navigate } from "../platform/router";

/** The click handler of a link inside the app: the router moves, a modifier or middle click is left to the browser. */
export const openInApp = (path: string) => (e: MouseEvent<HTMLAnchorElement>) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(path);
};
