"use client";

import { useState } from "react";

type ConfirmDialogProps = {
  title?: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  action: (formData: FormData) => void | Promise<void>;
  triggerText?: string;
  triggerClassName?: string;
  confirmClassName?: string;
};

export default function ConfirmDialog({
  title = "Are you sure?",
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  action,
  triggerText = "Delete",
  triggerClassName = "text-red-600 hover:text-red-800 border rounded px-2 py-1 hover:cursor-pointer",
  confirmClassName = "btn bg-red-600 text-white hover:bg-red-700 hover:cursor-pointer",
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerText}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl"
          >
            <h2 id="confirm-dialog-title" className="text-lg font-semibold">
              {title}
            </h2>

            <p className="mt-2 text-sm text-gray-600">{description}</p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="btn hover:cursor-pointer"
              >
                {cancelText}
              </button>

              <form action={action}>
                <button type="submit" className={confirmClassName}>
                  {confirmText}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
