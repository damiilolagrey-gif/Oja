import Link from "next/link";
import { ActionForm, Submit } from "@/components/ActionForm";
import { login } from "@/app/actions/auth";

export const metadata = { title: "Log in" };

export default function Login() {
  return (
    <main className="auth">
      <Link href="/" className="brand">Oja</Link>
      <h1>Log in</h1>
      <ActionForm action={login}>
        <label className="field">Email<input className="input" name="email" type="email" autoComplete="email" required /></label>
        <label className="field">Password<input className="input" name="password" type="password" autoComplete="current-password" required /></label>
        <Submit pendingText="Logging in…">Log in</Submit>
      </ActionForm>
      <p className="small muted">New here? <Link href="/signup">Create your shop</Link>. Sales reps get their login from the shop owner.</p>
    </main>
  );
}
