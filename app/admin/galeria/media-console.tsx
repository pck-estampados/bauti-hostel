"use client";

import Image from "next/image";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { AdminPageHeader, EmptyState } from "@/app/admin/components/ui";
import {
  MEDIA_CATEGORIES,
  MEDIA_CATEGORY_LABELS,
  type MediaAsset,
  type MediaSnapshot,
} from "@/app/lib/media-types";
import { buildPublicMediaUrl, MEDIA_MAX_BYTES } from "@/app/lib/media-validation";

type StatusFilter = "all" | "published" | "draft" | "inactive";

async function responsePayload(response: Response) {
  const payload = await response.json().catch(() => ({})) as {
    error?: string;
    state?: MediaSnapshot;
  };
  if (!response.ok) throw new Error(payload.error ?? "No fue posible completar la operación.");
  return payload;
}

function readableSize(bytes: number) {
  return new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);
}

function assetStatus(asset: MediaAsset) {
  if (!asset.active) return "Inactiva";
  if (asset.isPublished) return "Publicada";
  return "Borrador";
}

function MediaAssetEditor({
  asset,
  rooms,
  canManage,
  busy,
  onSaved,
  onDeleted,
  onError,
}: {
  asset: MediaAsset;
  rooms: MediaSnapshot["rooms"];
  canManage: boolean;
  busy: boolean;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const publicUrl = buildPublicMediaUrl(asset.storagePath);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/admin/media/${asset.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          altText: String(form.get("altText") ?? ""),
          caption: String(form.get("caption") ?? ""),
          category: String(form.get("category") ?? ""),
          sortOrder: Number(form.get("sortOrder") ?? 0),
          roomId: String(form.get("roomId") ?? ""),
          active: form.has("active"),
          isPublished: form.has("isPublished"),
        }),
      });
      await responsePayload(response);
      await onSaved();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No fue posible guardar la imagen.");
    }
  }

  async function remove() {
    if (!window.confirm(`¿Eliminar definitivamente “${asset.originalFilename}”?`)) return;
    try {
      const response = await fetch(`/api/admin/media/${asset.id}`, { method: "DELETE" });
      if (!response.ok) await responsePayload(response);
      await onDeleted();
    } catch (error) {
      onError(error instanceof Error ? error.message : "No fue posible eliminar la imagen.");
    }
  }

  return (
    <article className="admin-media-card">
      <div className="admin-media-card__visual">
        {publicUrl ? (
          <Image
            src={publicUrl}
            alt={asset.altText || "Imagen sin texto alternativo, todavía no publicada"}
            width={asset.width}
            height={asset.height}
            sizes="(max-width: 620px) 92vw, (max-width: 1220px) 44vw, 27vw"
          />
        ) : <span>Archivo no disponible</span>}
        <span className={`admin-media-status admin-media-status--${assetStatus(asset).toLowerCase()}`}>
          {assetStatus(asset)}
        </span>
      </div>
      <div className="admin-media-card__summary">
        <div>
          <strong>{MEDIA_CATEGORY_LABELS[asset.category]}</strong>
          <span>{asset.originalFilename}</span>
        </div>
        <dl>
          <div><dt>Dimensiones</dt><dd>{asset.width} × {asset.height} px</dd></div>
          <div><dt>Peso</dt><dd>{readableSize(asset.sizeBytes)} MB</dd></div>
          <div><dt>Orden</dt><dd>{asset.sortOrder}</dd></div>
          <div><dt>Habitación</dt><dd>{asset.roomName ?? "Sin asociar"}</dd></div>
        </dl>
      </div>

      <details className="admin-media-editor">
        <summary>Editar metadatos</summary>
        <form key={asset.updatedAt} onSubmit={save}>
          <fieldset disabled={!canManage || busy}>
            <label className="admin-field admin-field--wide">
              <span>Texto alternativo</span>
              <input name="altText" maxLength={300} defaultValue={asset.altText} />
              <small>Obligatorio antes de publicar. Describí lo visible con claridad.</small>
            </label>
            <label className="admin-field admin-field--wide">
              <span>Descripción</span>
              <textarea name="caption" maxLength={1000} rows={3} defaultValue={asset.caption ?? ""} />
            </label>
            <label className="admin-field">
              <span>Categoría</span>
              <select name="category" defaultValue={asset.category}>
                {MEDIA_CATEGORIES.map((category) => (
                  <option value={category} key={category}>{MEDIA_CATEGORY_LABELS[category]}</option>
                ))}
              </select>
            </label>
            <label className="admin-field">
              <span>Orden</span>
              <input name="sortOrder" type="number" min={0} max={10_000} defaultValue={asset.sortOrder} />
            </label>
            <label className="admin-field admin-field--wide">
              <span>Habitación asociada</span>
              <select name="roomId" defaultValue={asset.roomId ?? ""}>
                <option value="">Sin asociar</option>
                {rooms.map((room) => (
                  <option value={room.id} key={room.id}>{room.code} · {room.displayName}</option>
                ))}
              </select>
            </label>
            <label className="admin-check">
              <input name="active" type="checkbox" defaultChecked={asset.active} />
              <span>Activa</span>
            </label>
            <label className="admin-check">
              <input name="isPublished" type="checkbox" defaultChecked={asset.isPublished} />
              <span>Publicada en el sitio</span>
            </label>
            <div className="admin-media-actions">
              <button className="admin-button admin-button--primary" type="submit">Guardar cambios</button>
              <button className="admin-button admin-button--danger" type="button" onClick={remove}>Eliminar</button>
            </div>
          </fieldset>
        </form>
      </details>
    </article>
  );
}

export function MediaConsole({
  initialSnapshot,
  canRead,
  canManage,
  mode,
}: {
  initialSnapshot: MediaSnapshot;
  canRead: boolean;
  canManage: boolean;
  mode: "demo" | "production";
}) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [category, setCategory] = useState<"all" | MediaAsset["category"]>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const canWrite = mode === "production" && snapshot.schemaReady && canRead && canManage;
  const filteredAssets = useMemo(() => snapshot.assets.filter((asset) => {
    if (category !== "all" && asset.category !== category) return false;
    if (status === "published" && !asset.isPublished) return false;
    if (status === "draft" && (!asset.active || asset.isPublished)) return false;
    if (status === "inactive" && asset.active) return false;
    return true;
  }), [snapshot.assets, category, status]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function choosePreview(event: ChangeEvent<HTMLInputElement>) {
    if (preview) URL.revokeObjectURL(preview);
    const file = event.target.files?.[0];
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function refresh(message?: string) {
    setBusy(true);
    setError("");
    try {
      const payload = await responsePayload(await fetch("/api/admin/media", { cache: "no-store" }));
      if (payload.state) setSnapshot(payload.state);
      if (message) setNotice(message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const form = new FormData(event.currentTarget);
      const file = form.get("file");
      if (file instanceof File && file.size > MEDIA_MAX_BYTES) {
        throw new Error("La imagen debe pesar como máximo 6 MB.");
      }
      form.set("active", form.has("active") ? "true" : "false");
      form.set("isPublished", form.has("isPublished") ? "true" : "false");
      await responsePayload(await fetch("/api/admin/media", { method: "POST", body: form }));
      event.currentTarget.reset();
      if (preview) URL.revokeObjectURL(preview);
      setPreview(null);
      await refresh("La imagen se cargó correctamente.");
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "No fue posible cargar la imagen.");
      setBusy(false);
    }
  }

  async function afterMutation(message: string) {
    setNotice("");
    setBusy(true);
    try {
      await refresh(message);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "No fue posible actualizar la galería.");
      setBusy(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Contenido público"
        title="Galería de fotos"
        description="Cargá, describí, ordená y publicá únicamente fotografías reales del hostel."
      />

      {!snapshot.schemaReady ? (
        <div className="admin-notice admin-notice--warning" role="status">
          <strong>Galería pendiente de habilitación</strong>
          <span>La migración de medios todavía no está aplicada. Las cargas y ediciones permanecen deshabilitadas.</span>
        </div>
      ) : !canRead ? (
        <div className="admin-notice admin-notice--warning" role="alert">
          <strong>Acceso restringido</strong>
          <span>Tu usuario no tiene el permiso media.read para consultar este inventario.</span>
        </div>
      ) : !canManage ? (
        <div className="admin-notice" role="status">
          <strong>Modo de sólo lectura</strong>
          <span>Podés consultar la galería, pero necesitás media.manage para realizar cambios.</span>
        </div>
      ) : null}

      {error ? <div className="admin-form-error" role="alert">{error}</div> : null}
      {notice ? <div className="admin-form-success" role="status">{notice}</div> : null}

      <section className="admin-panel admin-media-upload">
        <div className="admin-panel__heading">
          <div><p>Nueva imagen</p><h2>Cargar fotografía</h2></div>
          <span className="admin-count">Máx. 6 MB</span>
        </div>
        <form onSubmit={upload}>
          <fieldset disabled={!canWrite || busy}>
            <div className="admin-media-upload__preview">
              {preview ? (
                <div className="admin-media-local-preview">
                  <Image
                    src={preview}
                    alt="Vista previa local de la imagen seleccionada"
                    fill
                    sizes="(max-width: 620px) 92vw, 420px"
                    unoptimized
                  />
                </div>
              ) : (
                <div><span aria-hidden="true">+</span><strong>Vista previa</strong><small>JPEG, PNG o WebP</small></div>
              )}
              <label className="admin-button admin-button--secondary">
                Seleccionar archivo
                <input
                  name="file"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
                  onChange={choosePreview}
                  required
                />
              </label>
            </div>
            <div className="admin-media-upload__fields">
              <label className="admin-field admin-field--wide">
                <span>Texto alternativo</span>
                <input name="altText" maxLength={300} placeholder="Descripción clara de lo que muestra la foto" />
                <small>Será obligatorio si marcás la imagen como publicada.</small>
              </label>
              <label className="admin-field admin-field--wide">
                <span>Descripción</span>
                <textarea name="caption" maxLength={1000} rows={3} />
              </label>
              <label className="admin-field">
                <span>Categoría</span>
                <select name="category" defaultValue="otros">
                  {MEDIA_CATEGORIES.map((item) => (
                    <option value={item} key={item}>{MEDIA_CATEGORY_LABELS[item]}</option>
                  ))}
                </select>
              </label>
              <label className="admin-field">
                <span>Orden</span>
                <input name="sortOrder" type="number" min={0} max={10_000} defaultValue={0} />
              </label>
              <label className="admin-field admin-field--wide">
                <span>Habitación asociada</span>
                <select name="roomId" defaultValue="">
                  <option value="">Sin asociar</option>
                  {snapshot.rooms.map((room) => (
                    <option value={room.id} key={room.id}>{room.code} · {room.displayName}</option>
                  ))}
                </select>
              </label>
              <label className="admin-check">
                <input name="active" type="checkbox" defaultChecked />
                <span>Activar al finalizar la carga</span>
              </label>
              <label className="admin-check">
                <input name="isPublished" type="checkbox" />
                <span>Publicar en el sitio</span>
              </label>
              <button className="admin-button admin-button--primary" type="submit">
                {busy ? "Procesando…" : "Cargar imagen"}
              </button>
            </div>
          </fieldset>
        </form>
      </section>

      <section className="admin-section">
        <div className="admin-section-heading admin-media-heading">
          <div><p>Inventario de medios</p><h2>Fotografías cargadas</h2></div>
          <div className="admin-media-filters" aria-label="Filtros de galería">
            <label>
              <span>Categoría</span>
              <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>
                <option value="all">Todas</option>
                {MEDIA_CATEGORIES.map((item) => (
                  <option value={item} key={item}>{MEDIA_CATEGORY_LABELS[item]}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Estado</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}>
                <option value="all">Todos</option>
                <option value="published">Publicadas</option>
                <option value="draft">Borradores</option>
                <option value="inactive">Inactivas</option>
              </select>
            </label>
          </div>
        </div>

        {snapshot.schemaReady && canRead && filteredAssets.length ? (
          <div className="admin-media-grid">
            {filteredAssets.map((asset) => (
              <MediaAssetEditor
                asset={asset}
                rooms={snapshot.rooms}
                canManage={canWrite}
                busy={busy}
                key={asset.id}
                onError={(message) => setError(message)}
                onSaved={() => afterMutation("Los cambios se guardaron correctamente.")}
                onDeleted={() => afterMutation("La imagen se eliminó correctamente.")}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={snapshot.assets.length ? "Sin resultados para estos filtros" : "Todavía no hay fotografías cargadas"}
            description={snapshot.assets.length
              ? "Probá otra combinación de categoría y estado."
              : "La galería permanecerá vacía hasta que se cargue y publique una fotografía real."}
          />
        )}
      </section>
    </>
  );
}
