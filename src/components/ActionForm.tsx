"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

export type FormState = { error?: string; ok?: string } | undefined;

export function Submit({ children, className = "btn primary", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button className={className} disabled={pending}>
      {pending ? pendingText ?? "Saving…" : children}
    </button>
  );
}

/** A form bound to a server action that returns { error } or { ok }; shows either under the fields. */
export function ActionForm({
  action,
  children,
  className = "stack",
}: {
  action: (state: FormState, data: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className={className}>
      {children}
      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.ok && <p className="notice good" role="status">{state.ok}</p>}
    </form>
  );
}
