import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth">
      <h1>Page not found</h1>
      <p className="muted">The link may be old or mistyped.</p>
      <Link href="/" className="btn">Go home</Link>
    </main>
  );
}
