import { useEffect, useRef, type ReactNode, type SyntheticEvent } from "react";
export function Dialog({
  children,
  onClose,
  labelledBy,
  className,
  onBackdrop,
}: {
  children: ReactNode;
  /** Escape. The event can be cancelled (preventDefault) to keep the dialog open, for example while busy. */
  onClose: (event: SyntheticEvent<HTMLDialogElement>) => void;
  labelledBy: string;
  /** Added to the dialog's own classes, for example "sheet-dialog" (UI-SPEC A14, A15). */
  className?: string;
  /** A click on the dim area outside the dialog. Left alone, the dialog ignores such clicks. */
  onBackdrop?: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={className ? `card dialog ${className}` : "card dialog"}
      onCancel={onClose}
      onClick={
        onBackdrop
          ? (event) => {
              // The backdrop is part of the dialog element, so a click on it targets the dialog itself;
              // a click on the dialog's own padding is inside its box and stays inside.
              if (event.target !== event.currentTarget) return;
              const box = event.currentTarget.getBoundingClientRect();
              const inside =
                event.clientX >= box.left &&
                event.clientX <= box.right &&
                event.clientY >= box.top &&
                event.clientY <= box.bottom;
              if (!inside) onBackdrop();
            }
          : undefined
      }
      aria-labelledby={labelledBy}
    >
      {children}
    </dialog>
  );
}
