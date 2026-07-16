"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

export default function RecoverAccessPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?returnTo=/actualizar-clave`,
      });
    } finally {
      setSent(true);
      setSubmitting(false);
    }
  }

  return (
    <main className="staff-auth">
      <section className="staff-auth__card" aria-labelledby="recover-title">
        <Link className="staff-auth__brand" href="/"><span>HB</span><strong>Hostel Bauti<small>Administración</small></strong></Link>
        <p className="staff-auth__eyebrow">Recuperar acceso</p>
        <h1 id="recover-title">Restablecer contraseña</h1>
        {sent ? <p>Si la cuenta existe, enviamos un enlace seguro a ese correo.</p> : (
          <form onSubmit={submit}>
            <label>Correo electrónico<input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <button disabled={submitting} type="submit">{submitting ? "Enviando…" : "Enviar enlace"}</button>
          </form>
        )}
        <div className="staff-auth__links"><Link href="/acceso-interno">Volver al ingreso</Link></div>
      </section>
    </main>
  );
}
