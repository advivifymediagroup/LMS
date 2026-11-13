"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoadingSpinner } from "./loading-ui";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Working…",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button {...props} disabled={disabled || pending} aria-busy={pending || undefined}>
      {pending && <LoadingSpinner />}
      {pending ? pendingText : children}
    </button>
  );
}
