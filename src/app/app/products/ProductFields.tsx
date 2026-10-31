export function ProductFields({ product }: { product?: { name: string; priceKobo: number; imageUrl: string | null; description: string | null; lowStockAt: number } }) {
  return (
    <>
      <label className="field">Name
        <input className="input" name="name" defaultValue={product?.name} placeholder="Ankara two-piece, size 12" required />
      </label>
      <label className="field">Price (₦)
        <input className="input" name="price" inputMode="decimal" defaultValue={product ? product.priceKobo / 100 : ""} placeholder="28500" required />
      </label>
      {!product && (
        <label className="field">Units in stock
          <input className="input" name="stock" type="number" inputMode="numeric" min={0} defaultValue={0} />
          <span className="hint">Leave at 0 for sold-out items so buyers can join the waitlist.</span>
        </label>
      )}
      <label className="field">Photo link (optional)
        <input className="input" name="imageUrl" type="url" defaultValue={product?.imageUrl ?? ""} placeholder="https://…" />
      </label>
      <label className="field">Details for buyers (optional)
        <textarea className="input" name="description" rows={3} defaultValue={product?.description ?? ""} placeholder="Sizes 8 to 16. Cotton Adire, hand-dyed. Runs small, size up." />
        <span className="hint">The AI agent uses this to answer questions, so include sizes, colours and materials.</span>
      </label>
      <label className="field">Alert me when stock falls to
        <input className="input" name="lowStockAt" type="number" inputMode="numeric" min={0} max={1000} defaultValue={product?.lowStockAt ?? 3} />
        <span className="hint">You get a WhatsApp alert at this level and again when it sells out.</span>
      </label>
    </>
  );
}
