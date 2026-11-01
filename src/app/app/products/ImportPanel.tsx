"use client";

import { useActionState } from "react";
import { Submit } from "@/components/ActionForm";
import { importCatalogue, type ImportState } from "@/app/actions/products";

/** Upload or paste a sheet, see what will change, then import. */
export function ImportPanel() {
  const [state, action] = useActionState<ImportState, FormData>(importCatalogue, undefined);
  const p = state?.preview;
  return (
    <div className="stack">
      <p className="muted small">
        Columns: <b>Name</b>, <b>Price</b>, Stock, Image link, Description, Low stock at. Products with a name you already have are updated;
        blank cells are left as they are. <a href="/app/products/export.csv">Download your products</a> to start from your current list.
      </p>
      {!p || p.errors.length ? (
        <form action={action} className="stack">
          <input type="hidden" name="mode" value="check" />
          <label className="stack small">
            CSV file (save from Excel or Google Sheets as CSV)
            <input className="input" type="file" name="file" accept=".csv,text/csv,text/plain,.tsv" />
          </label>
          <label className="stack small">
            Or copy the cells from your sheet and paste them here
            <textarea className="input" name="text" rows={5} defaultValue={p?.text ?? ""} placeholder={"Name\tPrice\tStock\nAdire maxi\t28500\t5"} />
          </label>
          <Submit pendingText="Checking…">Check sheet</Submit>
        </form>
      ) : null}

      {state?.error && <p className="error" role="alert">{state.error}</p>}
      {state?.ok && <p className="notice good" role="status">{state.ok}</p>}

      {p && p.errors.length > 0 && (
        <div className="notice bad" role="alert">
          <p>Fix these rows and check again. Nothing has been changed yet.</p>
          <ul className="small">{p.errors.map(e => <li key={e.line}>Row {e.line}: {e.message}</li>)}</ul>
        </div>
      )}

      {p && !p.errors.length && (
        <form action={action} className="stack">
          <p><b>{p.summary}</b></p>
          <ul className="small">
            {p.rows.map(r => <li key={r.line}>{r.name}: {r.what}</li>)}
          </ul>
          <input type="hidden" name="text" value={p.text} />
          <input type="hidden" name="mode" value="import" />
          <div className="row">
            <Submit pendingText="Importing…">Import</Submit>
            <button type="button" className="btn" onClick={() => location.reload()}>Start again</button>
          </div>
        </form>
      )}
    </div>
  );
}
