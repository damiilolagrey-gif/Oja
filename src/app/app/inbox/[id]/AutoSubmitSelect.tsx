"use client";

export function AutoSubmitSelect(props: {
  action: (data: FormData) => Promise<void>;
  conversationId: string;
  name: string;
  value: string;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <form action={props.action} style={{ flex: "1 1 160px", minWidth: 0 }}>
      <input type="hidden" name="conversationId" value={props.conversationId} />
      <select className="input" name={props.name} defaultValue={props.value} aria-label={props.label} onChange={e => e.currentTarget.form?.requestSubmit()}>
        {props.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </form>
  );
}
