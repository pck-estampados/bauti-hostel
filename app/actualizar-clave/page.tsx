"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmed, setConfirmed] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length < 10 || password !== confirmed) {
      setMessage("Usá al menos 10 caracteres y repetí la misma contraseña.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setMessage(error ? "No fue posible actualizar la contraseña." : "Contraseña actualizada. Ya podés ingresar al panel.");
  }

  return (
    <main className="staff-auth"><section className="staff-auth__card" aria-labelledby="password-title">
      <p className="staff-auth__eyebrow">Acceso privado</p><h1 id="password-title">Nueva contraseña</h1>
      <form onSubmit={submit}>
        <label>Nueva contraseña<input autoComplete="new-password" minLength={10} required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Repetir contraseña<input autoComplete="new-password" minLength={10} required type="password" value={confirmed} onChange={(event) => setConfirmed(event.target.value)} /></label>
        {message ? <p role="status">{message}</p> : null}<button type="submit">Guardar contraseña</button>
      </form>
      <div className="staff-auth__links"><Link href="/acceso-interno">Ir al ingreso</Link></div>
    </section></main>
  );
}
