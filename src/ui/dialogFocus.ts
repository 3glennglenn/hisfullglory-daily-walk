import { useEffect, useState } from "react";

// Shared by ConfirmDialog and TextSheet (UI-SPEC A15): the dialog gives focus back to the control that
// opened it. When that control is gone (a deleted entry took its Delete button with it) focus goes to the
// page's main region, so a keyboard or screen reader user is never left on nothing.
export function useReturnFocus() {
  // Read while rendering, before the dialog opens and moves focus into itself.
  const [trigger] = useState(() => (document.activeElement instanceof HTMLElement ? document.activeElement : null));
  useEffect(
    () => () => {
      if (trigger?.isConnected) trigger.focus();
      else document.getElementById("main")?.focus();
    },
    [trigger],
  );
}

/** Whether an action's result is a promise, so the button can show its busy text while it waits. */
export function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}
