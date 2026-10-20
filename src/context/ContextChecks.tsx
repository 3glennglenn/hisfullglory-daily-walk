import { Check, ChevronRight } from "lucide-react";
import { cameFrom } from "../platform/router";
import { usePlatform } from "../platform/store";
import { AiBadge } from "../ui/Badges";
import { openInApp } from "../ui/internalLink";
import { LargeTitle, Toolbar } from "../ui/Screen";
import { aiUnreviewedCardLabel, refLabel, splitHook } from "./checks";
import { contextChecks } from "./data";

// Context checks (UI-SPEC A8, 8.2): every published check, newest first, in one grouped list. A check the reader
// has finished carries a check mark with the hidden words "On your shelf"; one that no person checked carries the
// AI badge and its label in words. Rows wrap; nothing is cut short (the hook's first sentence is short by format).
// "?unpublished=1" is the fixed marker a spine on the shelf sets when its check has been taken down: it puts one
// sentence above the list. It names no check.
export function ContextChecks() {
  const { state } = usePlatform();
  const unpublished = new URLSearchParams(location.search).get("unpublished") === "1";
  const finished = new Set(state.shelf.map((entry) => entry.slug));
  // Back names the screen the reader came from: the shelf, the Bible library, or Today.
  const from = cameFrom();
  const back = from === "/shelf" ? { name: "Your shelf", to: "/shelf" } : from.startsWith("/bible") ? { name: "Bible", to: "/bible" } : { name: "Today", to: "/" };
  return (
    <section className="grouped-screen">
      <Toolbar back={back.name} to={back.to} />
      <LargeTitle>Context checks</LargeTitle>
      {unpublished && <p className="state-text">This context check is no longer published.</p>}
      <div className="group">
        <ul className="group-list">
          {contextChecks.map((check) => {
            const path = `/context/${check.slug}`;
            const read = finished.has(check.slug);
            return (
              <li key={check.slug}>
                <a className="list-row" href={path} onClick={openInApp(path)}>
                  <span className="list-row-text">
                    <span className="list-row-title check-row-title">
                      {refLabel(check.verse)}
                      {read && (
                        <>
                          <Check className="check-row-done" aria-hidden="true" focusable="false" size={18} strokeWidth={2.5} />
                          <span className="sr-only">On your shelf</span>
                        </>
                      )}
                    </span>
                    <span className="check-row-hook">{splitHook(check.hook).first}</span>
                    {check.review === "ai-unreviewed" && (
                      <span className="check-row-ai">
                        <AiBadge />
                        <span>{aiUnreviewedCardLabel}</span>
                      </span>
                    )}
                  </span>
                  <ChevronRight className="list-row-chevron" aria-hidden="true" focusable="false" size={20} />
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
