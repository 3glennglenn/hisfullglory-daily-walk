import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  BookMarked,
  BookOpen,
  CircleUser,
  Heart,
  MessagesSquare,
  type LucideIcon,
} from "lucide-react";
import { navigate } from "../platform/router";

// The five tabs of UI-SPEC 8.1: single words, each one a link (aria-current on the selected one).
// A floating capsule on a phone, a 280px sidebar from 768px (styles.css, section "TabBar").
export type TabId = "today" | "bible" | "pray" | "community" | "you";
interface Tab {
  id: TabId;
  label: string;
  path: string;
  Icon: LucideIcon;
  // Icons that read well as a solid shape are filled when selected; the others only get a heavier stroke.
  filled: boolean;
}
export const tabs: readonly Tab[] = [
  { id: "today", label: "Today", path: "/", Icon: BookMarked, filled: true },
  { id: "bible", label: "Bible", path: "/bible", Icon: BookOpen, filled: true },
  { id: "pray", label: "Pray", path: "/pray", Icon: Heart, filled: true },
  {
    id: "community",
    label: "Community",
    path: "/community",
    Icon: MessagesSquare,
    filled: true,
  },
  { id: "you", label: "You", path: "/you", Icon: CircleUser, filled: false },
];
// Which tab a route belongs to (UI-SPEC 8.1, 8.2). Pushed screens keep the tab they were reached from.
const tabByPage: Record<string, TabId> = {
  home: "today",
  walk: "today",
  context: "today",
  shelf: "today",
  bible: "bible",
  pray: "pray",
  community: "community",
  circles: "community",
  you: "you",
  profile: "you",
  settings: "you",
  "my-walk": "you",
  journal: "you",
  grow: "you",
  give: "you",
  shop: "you",
  "giving-policy": "you",
};
export const tabFor = (page: string): TabId | null => tabByPage[page] ?? null;

// A press held this long (or the context-menu key) shows the tab's name at twice the size (UI-SPEC 14, 1.4.4).
const HOLD_MS = 500;

export function TabBar({ active }: { active: TabId | null }) {
  const [tip, setTip] = useState<{ id: TabId; x: number } | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  // A long press ended on the tab: the click that follows it must not navigate.
  const held = useRef(false);

  const show = (id: TabId, el: HTMLElement) => {
    const nav = navRef.current?.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (nav) setTip({ id, x: box.left + box.width / 2 - nav.left });
  };
  const hide = () => {
    window.clearTimeout(timer.current);
    setTip(null);
  };
  // Keep the popover inside the screen: it is centred over the tab, then moved in if it would cross an edge.
  useLayoutEffect(() => {
    const pop = tipRef.current;
    const nav = navRef.current;
    if (!tip || !pop || !nav) return;
    const edge = 8;
    const navLeft = nav.getBoundingClientRect().left;
    const width = pop.offsetWidth;
    const centre = navLeft + tip.x;
    const left = Math.min(
      Math.max(centre - width / 2, edge),
      Math.max(edge, document.documentElement.clientWidth - edge - width),
    );
    pop.style.left = `${left - navLeft}px`;
  }, [tip]);
  useEffect(() => {
    if (!tip) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    const press = () => hide();
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", press);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", press);
    };
  }, [tip]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const open = (e: MouseEvent<HTMLAnchorElement>, path: string) => {
    if (held.current) {
      held.current = false;
      e.preventDefault();
      return;
    }
    // Modifier and middle clicks are left to the browser (new tab, copy link).
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  };

  const tipLabel = tabs.find((t) => t.id === tip?.id)?.label;
  return (
    <nav className="tabbar" aria-label="Main navigation" ref={navRef}>
      <ul>
        {tabs.map(({ id, label, path, Icon, filled }) => {
          const selected = active === id;
          return (
            <li key={id}>
              <a
                href={path}
                className="tab"
                draggable={false}
                aria-current={selected ? "page" : undefined}
                aria-describedby={tip?.id === id ? "tab-tip" : undefined}
                onClick={(e) => open(e, path)}
                onPointerDown={(e) => {
                  if (e.pointerType === "mouse" && e.button !== 0) return;
                  held.current = false;
                  window.clearTimeout(timer.current);
                  const el = e.currentTarget;
                  timer.current = window.setTimeout(() => {
                    held.current = true;
                    show(id, el);
                  }, HOLD_MS);
                }}
                onPointerUp={() => {
                  window.clearTimeout(timer.current);
                  if (held.current) setTip(null);
                }}
                onPointerCancel={hide}
                onPointerLeave={() => {
                  window.clearTimeout(timer.current);
                  if (held.current) setTip(null);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  show(id, e.currentTarget);
                }}
                onBlur={hide}
              >
                <Icon
                  className="tab-icon"
                  aria-hidden="true"
                  focusable="false"
                  strokeWidth={selected ? 2.5 : 1.75}
                  fill={selected && filled ? "currentColor" : "none"}
                />
                <span className="tab-label">{label}</span>
              </a>
            </li>
          );
        })}
      </ul>
      {tip && (
        <div className="tab-tip" id="tab-tip" role="tooltip" ref={tipRef}>
          {tipLabel}
        </div>
      )}
    </nav>
  );
}
