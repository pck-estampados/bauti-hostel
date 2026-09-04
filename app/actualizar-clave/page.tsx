"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

function UpdatePasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRecovery = searchParams.get("recovery") === "1";
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [message, setMessage] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      setSessionReady(!error && Boolean(data.user) && isRecovery);
      setCheckingSession(false);
    });
    return () => { active = false; };
  }, [isRecovery]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10 || password !== confirmed) {
      setMessage("Usá al menos 10 caracteres y repetí la misma contraseña.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage("No fue posible actualizar la contraseña. Solicitá un enlace nuevo e intentá nuevamente.");
      return;
    }
    await supabase.auth.signOut();
    router.replace("/acceso-interno?password=updated");
    router.refresh();
  }

  return (
    <main className="staff-auth"><section className="staff-auth__card" aria-labelledby="password-title">
      <p className="staff-auth__eyebrow">Acceso privado</p><h1 id="password-title">Nueva contraseña</h1>
      {checkingSession ? <p role="status">Verificando el enlace seguro…</p> : null}
      {!checkingSession && !sessionReady ? <div className="staff-auth__error" role="alert"><p>El enlace es inválido o venció.</p><Link href="/recuperar-acceso">Solicitar un enlace nuevo</Link></div> : null}
      <form hidden={!sessionReady} onSubmit={submit}>
        <label>Nueva contraseña<input autoComplete="new-password" minLength={10} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Repetir contraseña<input autoComplete="new-password" minLength={10} required type="password" value={confirmed} onChange={(event) => setConfirmed(event.target.value)} /></label>
        {message ? <p role="status">{message}</p> : null}<button type="submit">Guardar contraseña</button>
      </form>
      <div className="staff-auth__links"><Link href="/acceso-interno">Ir al ingreso</Link></div>
    </section></main>
  );
}

export default function UpdatePasswordPage() {
  return <Suspense fallback={<main className="staff-auth" aria-busy="true" />}><UpdatePasswordForm /></Suspense>;
}
