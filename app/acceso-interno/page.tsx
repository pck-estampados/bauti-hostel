"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

export default function StaffLoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
      const returnTo = searchParams.get("returnTo");
      window.location.assign(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/admin");
    } catch {
      setError("No pudimos iniciar sesión. Revisá tus datos o solicitá un nuevo acceso.");
      setSubmitting(false);
    }
  }

  return (
    <main className="staff-auth">
      <section className="staff-auth__card" aria-labelledby="staff-login-title">
        <Link className="staff-auth__brand" href="/"><span>HB</span><strong>Hostel Bauti<small>Administración</small></strong></Link>
        <p className="staff-auth__eyebrow">Acceso privado</p>
        <h1 id="staff-login-title">Ingresar al panel</h1>
        <p>Usá la cuenta de empleado que fue creada por un administrador.</p>
        <form onSubmit={submit}>
          <label>Correo electrónico<input autoComplete="email" inputMode="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Contraseña<input autoComplete="current-password" minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <p className="staff-auth__error" role="alert">{error}</p> : null}
          <button disabled={submitting} type="submit">{submitting ? "Ingresando…" : "Ingresar"}</button>
        </form>
        <div className="staff-auth__links"><Link href="/recuperar-acceso">Olvidé mi contraseña</Link><Link href="/">Volver al sitio</Link></div>
        <small>No existe registro público de empleados. Los accesos se habilitan internamente.</small>
      </section>
    </main>
  );
}
