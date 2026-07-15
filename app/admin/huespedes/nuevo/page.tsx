"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useOperations } from "../../components/operations-provider";
import { AdminPageHeader } from "../../components/ui";

export default function NewGuestPage() {
  const router = useRouter(); const { addGuest } = useOperations();
  const [error, setError] = useState(""); const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", document: "", email: "" });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { addGuest(form); router.push("/admin/huespedes/actuales?created=guest"); } catch (caught) { setError(caught instanceof Error ? caught.message : "No fue posible registrar."); } }
  return <><AdminPageHeader eyebrow="Base de huéspedes" title="Registrar huésped" description="Crea una ficha básica sin exigir una reserva ni datos secundarios." /><form className="admin-form-card admin-form-card--narrow" onSubmit={submit}><div className="admin-field-grid"><label>Nombre<input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label><label>Apellido<input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label><label>Teléfono<input required type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Documento <small>opcional</small><input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></label><label className="admin-field--full">Email <small>opcional</small><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label></div>{error ? <p className="admin-form-error">{error}</p> : null}<button className="admin-button admin-button--primary" type="submit">Guardar huésped</button></form></>;
}
