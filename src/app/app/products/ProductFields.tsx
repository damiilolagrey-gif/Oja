export function ProductFields({ product }: { product?: { name: string; priceKobo: number; imageUrl: string | null } }) {
  return (
    <>
      <label className="field">Name
        <input className="input" name="name" defaultValue={product?.name} placeholder="Ankara two-piece, size 12" required />
      </label>
      <label className="field">Price (₦)
        <input className="input" name="price" inputMode="decimal" defaultValue={product?.priceKobo ? product.priceKobo / 100 : ""} placeholder="28500" required />
      </label>
      {!product && (
        <label className="field">Units in stock
          <input className="input" name="stock" type="number" inputMode="numeric" min={0} defaultValue={0} />
          <span className="hint">Leave at 0 for sold-out items so buyers can join the waitlist.</span>
        </label>
      )}
      {/* Photos sent on WhatsApp or copied from Instagram are stored by Oja, so there's no link to edit. */}
      {product?.imageUrl?.startsWith("/api/products/") ? (
        <p className="small muted">Photo saved from WhatsApp or Instagram.</p>
      ) : (
        <label className="field">Photo link (optional)
          <input className="input" name="imageUrl" type="url" defaultValue={product?.imageUrl ?? ""} placeholder="https://…" />
        </label>
      )}
    </>
  );
}
