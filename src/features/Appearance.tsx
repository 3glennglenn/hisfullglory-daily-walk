import { useId, useRef, type KeyboardEvent } from "react";
import { LAMPLIGHT_NAMES, LOOK_NAMES, MODE_ORDER, modeHint, type Look } from "../platform/appearance";
import { useAppearance } from "../platform/AppearanceProvider";
import { Toolbar } from "../ui/Screen";
import { Segmented, radioKeyTarget } from "../ui/Segmented";

// You, Appearance (UI-SPEC A13, 01.2 D-08): the theme and Night light, in one place, applied the moment they are
// chosen. Nothing here is saved to an account; the choice lives in two keys on this device.
const looks: readonly Look[] = ["cover", "marked"];
const modeOptions = MODE_ORDER.map((value) => ({ value, label: LAMPLIGHT_NAMES[value] }));

// A drawing of Today in a look, with no text: the cover block (Cover) or the ribbon (Marked) above three
// bars. It is drawn in the current mode, so the two tiles show what each look would be right now.
function Miniature({ look }: { look: Look }) {
  return (
    <span className="look-mini" data-look-mini={look} aria-hidden="true">
      {look === "cover" ? <span className="mini-cover" /> : <span className="mini-ribbon" />}
      <span className="mini-bar" />
      <span className="mini-bar" />
      <span className="mini-bar" />
    </span>
  );
}

function Tick() {
  return (
    <svg className="look-check" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="11" />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// The mode control, Automatic | Day | Night light, with the one line that says what the choice does (UI-SPEC 2.4, 3).
// It is used on the Appearance screen and inline in the You sheet; `labelledBy` is the id of the visible name that
// the group takes ("Night light" on the screen, "Appearance" in the sheet). Choosing applies at once and nothing
// else happens: no card, no announcement, no focus change (D-09).
export function ModeControl({ labelledBy }: { labelledBy: string }) {
  const { lamplight, setLamplight } = useAppearance();
  const hint = useId();
  return (
    <>
      <Segmented labelledBy={labelledBy} describedBy={hint} value={lamplight} options={modeOptions} onChange={setLamplight} />
      <p className="appearance-hint" id={hint}>
        {modeHint(lamplight, navigator.userAgent)}
      </p>
    </>
  );
}

export function Appearance() {
  const { look, setLook } = useAppearance();
  const tiles = useRef<HTMLDivElement>(null);
  function onTileKeys(event: KeyboardEvent<HTMLDivElement>) {
    const next = radioKeyTarget(event.key, looks, look);
    if (next === null) return;
    event.preventDefault();
    setLook(next);
    tiles.current?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus();
  }
  return (
    <section className="grouped-screen appearance-screen">
      <Toolbar back="You" to="/you" title="Appearance" />
      <section className="group">
        <h2 className="group-title" id="appearance-theme">
          Theme
        </h2>
        <div ref={tiles} className="look-tiles" role="radiogroup" aria-labelledby="appearance-theme" onKeyDown={onTileKeys}>
          {looks.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              className="look-tile"
              data-value={value}
              aria-checked={value === look}
              tabIndex={value === look ? 0 : -1}
              onClick={() => setLook(value)}
            >
              <Miniature look={value} />
              <span className="look-tile-name">
                <span>{LOOK_NAMES[value]}</span>
                {value === look && <Tick />}
              </span>
            </button>
          ))}
        </div>
      </section>
      <section className="group">
        <h2 className="group-title" id="appearance-mode">
          Night light
        </h2>
        <ModeControl labelledBy="appearance-mode" />
      </section>
    </section>
  );
}
