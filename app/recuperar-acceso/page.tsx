"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import { brand } from "@/app/lib/brand";

export default function RecoverAccessPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const recoveryUrl = new URL("/auth/callback", siteUrl);
      recoveryUrl.searchParams.set("flow", "recovery");
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: recoveryUrl.toString(),
      });
      if (recoveryError) throw recoveryError;
      setSent(true);
    } catch {
      setError("No pudimos enviar el enlace. Esperá unos minutos e intentá nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="staff-auth">
      <section className="staff-auth__card" aria-labelledby="recover-title">
        <Link className="staff-auth__brand" href="/" aria-label={`${brand.publicName}, inicio`}><Image src={brand.assets.isotipo} alt="" width={44} height={44} /><strong>{brand.publicName}<small>Administración</small></strong></Link>
        <p className="staff-auth__eyebrow">Recuperar acceso</p>
        <h1 id="recover-title">Restablecer contraseña</h1>
        {sent ? <p>Si la cuenta existe, enviamos un enlace seguro a ese correo.</p> : (
          <form onSubmit={submit}>
            <label>Correo electrónico<input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            {error ? <p className="staff-auth__error" role="alert">{error}</p> : null}
            <button disabled={submitting} type="submit">{submitting ? "Enviando…" : "Enviar enlace"}</button>
          </form>
        )}
        <div className="staff-auth__links"><Link href="/acceso-interno">Volver al ingreso</Link></div>
      </section>
    </main>
  );
}
