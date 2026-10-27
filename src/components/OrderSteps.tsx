import type { OrderStatus } from "@prisma/client";
import { STEPS, stepsDone } from "@/lib/escrow";

export function OrderSteps({ status }: { status: OrderStatus }) {
  const done = stepsDone(status);
  return (
    <ol className="steps" aria-label="Order progress">
      {STEPS.map((s, i) => (
        <li key={s} className={i < done ? "on" : undefined}>{s}</li>
      ))}
    </ol>
  );
}
