import { useId, type MouseEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { navigate } from "../platform/router";

// A grouped list (UI-SPEC 7.1, A12): one --surface section on the page background, an optional
// header in Footnote 13/600 --muted, rows below. `plain` holds any other content (a form, a list of
// links) in the same surface instead of a list of rows. `note` is a sentence under the surface.
export function GroupedList({
  title,
  id,
  plain,
  note,
  children,
}: {
  title?: string;
  id?: string;
  plain?: boolean;
  note?: ReactNode;
  children: ReactNode;
}) {
  const heading = useId();
  return (
    <section className="group" id={id} aria-labelledby={title ? heading : undefined}>
      {title && (
        <h2 className="group-title" id={heading}>
          {title}
        </h2>
      )}
      {plain ? <div className="group-list group-plain">{children}</div> : <ul className="group-list">{children}</ul>}
      {note && <p className="group-note">{note}</p>}
    </section>
  );
}

// One row: the whole row is the target. A link when it has an href (an address on this site goes
// through the router, `external` opens another page in a new tab), a button when it has onClick,
// otherwise plain information. Title is Body 17/600, the detail Footnote 13 and the value Body 17,
// both muted. `quiet` turns the title into a plain link-coloured line.
export function Row({
  title,
  detail,
  value,
  chevron,
  href,
  external,
  quiet,
  disabled,
  onClick,
}: {
  title: ReactNode;
  detail?: ReactNode;
  value?: ReactNode;
  chevron?: boolean;
  href?: string;
  external?: boolean;
  quiet?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  const className = quiet ? "list-row list-row-quiet" : "list-row";
  const inner = (
    <>
      <span className="list-row-text">
        <span className="list-row-title">{title}</span>
        {detail && <span className="list-row-detail">{detail}</span>}
      </span>
      {value !== undefined && value !== null && <span className="list-row-value">{value}</span>}
      {chevron && <ChevronRight className="list-row-chevron" aria-hidden="true" focusable="false" size={20} />}
    </>
  );
  if (href && external)
    return (
      <li>
        <a className={className} href={href} target="_blank" rel="noopener">
          {inner}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </li>
    );
  if (href)
    return (
      <li>
        <a
          className={className}
          href={href}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            // Modifier and middle clicks are left to the browser (new tab, copy link).
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigate(href);
          }}
        >
          {inner}
        </a>
      </li>
    );
  if (onClick)
    return (
      <li>
        <button type="button" className={className} disabled={disabled} onClick={onClick}>
          {inner}
        </button>
      </li>
    );
  return (
    <li>
      <div className={className}>{inner}</div>
    </li>
  );
}
