import React from "react";
import { Button } from "../primitives";
import { Modal } from "./Modal";

/** A yes/no Modal for destructive actions: confirm, cancel, or close (✕ / backdrop / Esc). */
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel,
  pending,
  onConfirm,
  onCancel,
}: {
  title: React.ReactNode;
  body?: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button kind="danger" icon="Trash" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      {body && (
        <div style={{ padding: "18px 24px", fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          {body}
        </div>
      )}
    </Modal>
  );
}
