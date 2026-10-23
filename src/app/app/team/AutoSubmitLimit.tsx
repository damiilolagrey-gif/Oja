"use client";

export function AutoSubmitLimit({ action, value }: { action: (d: FormData) => Promise<void>; value: number }) {
  return (
    <form action={action} className="row small muted">
      <label htmlFor="miss-limit">Count a chat as missed when the first reply takes longer than</label>
      <select id="miss-limit" className="input" name="minutes" defaultValue={value} style={{ width: "auto" }} onChange={e => e.currentTarget.form?.requestSubmit()}>
        {[5, 10, 15, 30, 60, 120].map(m => <option key={m} value={m}>{m} min</option>)}
      </select>
    </form>
  );
}
