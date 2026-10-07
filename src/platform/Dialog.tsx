import { useEffect, useRef, type ReactNode } from "react";
export function Dialog({
  children,
  onClose,
  labelledBy,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
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
      className="card dialog"
      onCancel={onClose}
      aria-labelledby={labelledBy}
    >
      {children}
    </dialog>
  );
}
