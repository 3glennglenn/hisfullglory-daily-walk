import { useRef, type KeyboardEvent } from "react";
import { LAMPLIGHT_NAMES, LOOK_NAMES, type Lamplight, type Look } from "../platform/appearance";
import { useAppearance } from "../platform/AppearanceProvider";
import { Toolbar } from "../ui/Screen";
import { Segmented, radioKeyTarget } from "../ui/Segmented";

// You, Appearance (UI-SPEC A13): the theme and Lamplight, in one place, applied the moment they are
// chosen. Nothing here is saved to an account; the choice lives in two keys on this device.
const looks: readonly Look[] = ["cover", "marked"];
const lamplightOptions = (["auto", "on", "off"] as const satisfies readonly Lamplight[]).map((value) => ({
  value,
  label: LAMPLIGHT_NAMES[value],
}));

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

export const LAMPLIGHT_HINT =
  "Lamplight dims the page to warm browns for reading at night. Automatic follows your device.";

export function Appearance() {
  const { look, lamplight, deviceDark, setLook, setLamplight } = useAppearance();
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
        <h2 className="group-title" id="appearance-lamplight">
          Lamplight
        </h2>
        <Segmented labelledBy="appearance-lamplight" value={lamplight} options={lamplightOptions} onChange={setLamplight} />
        <p className="appearance-hint">{LAMPLIGHT_HINT}</p>
        <p className="appearance-now" role="status">
          {lamplight === "auto"
            ? deviceDark
              ? "On now, because your device is set to dark."
              : "Off now, because your device is set to light."
            : ""}
        </p>
      </section>
    </section>
  );
}
