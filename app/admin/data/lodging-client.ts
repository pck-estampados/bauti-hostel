export async function lodgingMutation(action: string, input: unknown, id?: string | null) {
  const response = await fetch("/api/admin/lodging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, input, ...(id ? { id } : {}) }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "No se pudo guardar.");
  return data.result;
}
