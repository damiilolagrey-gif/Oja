import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { signup } from "@/app/actions/auth";

export const metadata = { title: "Create your shop" };

export default function Signup() {
  return (
    <main className="auth">
      <Link href="/" className="brand">Oja</Link>
      <div className="stack" style={{ gap: 4 }}>
        <h1>Create your shop</h1>
        <p className="muted">Free while we&apos;re in beta. Takes two minutes.</p>
      </div>
      <ActionForm action={signup}>
        <label className="field">Shop name<input className="input" name="shopName" placeholder="Asa Wears" required /></label>
        <label className="field">Instagram handle<input className="input" name="igHandle" placeholder="@asawears.ng" autoCapitalize="none" /></label>
        <label className="field">Your name<input className="input" name="name" autoComplete="name" required /></label>
        <label className="field">Email<input className="input" name="email" type="email" autoComplete="email" required /></label>
        <label className="field">Password<input className="input" name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
        <Submit pendingText="Creating…">Create shop</Submit>
      </ActionForm>
      <p className="small muted">Already have an account? <Link href="/login">Log in</Link></p>
    </main>
  );
}
