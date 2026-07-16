import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  bedInputSchema,
  generalSettingsSchema,
  policySettingsSchema,
  priceSettingsSchema,
  profileInputSchema,
  roomInputSchema,
  roomServiceAssignmentSchema,
  roomServiceInputSchema,
  roomTypeInputSchema,
  scheduleSettingsSchema,
} from "./configuration-validation";
import type {
  BedType,
  ConfigurationBed,
  ConfigurationPermission,
  ConfigurationProfile,
  ConfigurationRole,
  ConfigurationRoom,
  ConfigurationRoomService,
  ConfigurationRoomType,
  ConfigurationSnapshot,
  GeneralSettings,
  PolicySettings,
  PriceSettings,
  ProfileStatus,
  ScheduleSettings,
  StoredSetting,
} from "./configuration-types";
import type { RoomStatus } from "../lib/types";

const SETTINGS = {
  general: "hostel.general",
  schedules: "hostel.schedules",
  price: "pricing.base_price",
  policies: "hostel.policies",
} as const;

type GeneralInput = z.infer<typeof generalSettingsSchema>;
type ScheduleInput = z.infer<typeof scheduleSettingsSchema>;
type PriceInput = z.infer<typeof priceSettingsSchema>;
type PolicyInput = z.infer<typeof policySettingsSchema>;
type RoomTypeInput = z.infer<typeof roomTypeInputSchema>;
type RoomInput = z.infer<typeof roomInputSchema>;
type BedInput = z.infer<typeof bedInputSchema>;
type RoomServiceInput = z.infer<typeof roomServiceInputSchema>;
type RoomServiceAssignmentInput = z.infer<typeof roomServiceAssignmentSchema>;
type ProfileInput = z.infer<typeof profileInputSchema>;

type SettingRow = { key: string; value: unknown; updated_at: string };
type RoomTypeRow = { id: string; code: string; name: string; public_name?: string | null; description: string | null; default_capacity: number; base_rate?: number | null; active: boolean };
type RoomRow = { id: string; room_type_id: string | null; code: string; display_name: string; capacity: number; status: RoomStatus; sector?: string | null; internal_notes?: string | null; active: boolean };
type BedRow = { id: string; room_id: string; code: string; bed_type: BedType; quantity?: number; capacity: number; active: boolean };
type RoomServiceRow = { id: string; code: string; name: string; description: string | null; is_system: boolean; active: boolean };
type RoomServiceAssignmentRow = { room_id: string; service_id: string };
type ProfileRow = { id: string; display_name: string; phone: string | null; status: ProfileStatus; created_at: string };
type RoleRow = { id: string; code: string; name: string; description: string | null; is_system: boolean };
type PermissionRow = { id: string; code: string; description: string };
type RolePermissionRow = { role_id: string; permission_id: string };
type UserRoleRow = { user_id: string; role_id: string };

function storedSetting<T>(
  rows: SettingRow[],
  key: string,
  schema: z.ZodType<T>,
): StoredSetting<T> | null {
  const row = rows.find((item) => item.key === key);
  if (!row) return null;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? { value: parsed.data, updatedAt: row.updated_at } : null;
}

function databaseError(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(fallback);
}

function isInventoryExtensionMissing(error: { code?: string; message: string } | null): boolean {
  if (!error) return false;
  return ["42P01", "42703", "PGRST200", "PGRST204", "PGRST205"].includes(error.code ?? "")
    || /room_services|public_name|base_rate|internal_notes|quantity/i.test(error.message);
}

export class SupabaseConfigurationRepository {
  constructor(private readonly client: SupabaseClient) {}

  async loadSnapshot(): Promise<ConfigurationSnapshot> {
    const serviceProbe = await this.client
      .from("room_services")
      .select("id,code,name,description,is_system,active")
      .order("name");
    const inventorySchemaReady = !serviceProbe.error;
    if (serviceProbe.error && !isInventoryExtensionMissing(serviceProbe.error)) {
      databaseError(serviceProbe.error, "No fue posible cargar los servicios de habitación.");
    }

    const roomTypeSelection = inventorySchemaReady
      ? "id,code,name,public_name,description,default_capacity,base_rate,active"
      : "id,code,name,description,default_capacity,active";
    const roomSelection = inventorySchemaReady
      ? "id,room_type_id,code,display_name,capacity,status,sector,internal_notes,active"
      : "id,room_type_id,code,display_name,capacity,status,active";
    const bedSelection = inventorySchemaReady
      ? "id,room_id,code,bed_type,quantity,capacity,active"
      : "id,room_id,code,bed_type,capacity,active";

    const [settings, roomTypes, rooms, beds, profiles, roles, permissions, rolePermissions, userRoles] =
      await Promise.all([
        this.client.from("settings").select("key,value,updated_at").in("key", Object.values(SETTINGS)),
        this.client.from("room_types").select(roomTypeSelection).order("name"),
        this.client.from("rooms").select(roomSelection).order("code"),
        this.client.from("beds").select(bedSelection).order("code"),
        this.client.from("profiles").select("id,display_name,phone,status,created_at").order("display_name"),
        this.client.from("roles").select("id,code,name,description,is_system").order("name"),
        this.client.from("permissions").select("id,code,description").order("code"),
        this.client.from("role_permissions").select("role_id,permission_id"),
        this.client.from("user_roles").select("user_id,role_id"),
      ]);

    for (const result of [settings, roomTypes, rooms, beds, profiles, roles, permissions, rolePermissions, userRoles]) {
      databaseError(result.error, "No fue posible cargar la configuración.");
    }

    const settingRows = (settings.data ?? []) as SettingRow[];
    const rolePermissionRows = (rolePermissions.data ?? []) as RolePermissionRow[];
    const userRoleRows = (userRoles.data ?? []) as UserRoleRow[];
    let serviceAssignmentRows: RoomServiceAssignmentRow[] = [];
    if (inventorySchemaReady) {
      const assignments = await this.client.from("room_service_assignments").select("room_id,service_id");
      databaseError(assignments.error, "No fue posible cargar los servicios asignados.");
      serviceAssignmentRows = (assignments.data ?? []) as RoomServiceAssignmentRow[];
    }

    return {
      inventorySchemaReady,
      settings: {
        general: storedSetting<GeneralSettings>(settingRows, SETTINGS.general, generalSettingsSchema),
        schedules: storedSetting<ScheduleSettings>(settingRows, SETTINGS.schedules, scheduleSettingsSchema),
        price: storedSetting<PriceSettings>(settingRows, SETTINGS.price, priceSettingsSchema),
        policies: storedSetting<PolicySettings>(settingRows, SETTINGS.policies, policySettingsSchema),
      },
      roomTypes: ((roomTypes.data ?? []) as unknown as RoomTypeRow[]).map<ConfigurationRoomType>((row) => ({
        id: row.id,
        code: row.code,
        internalName: row.name,
        publicName: row.public_name ?? "",
        description: row.description ?? "",
        defaultCapacity: row.default_capacity,
        baseRate: row.base_rate == null ? null : Number(row.base_rate),
        active: row.active,
      })),
      rooms: ((rooms.data ?? []) as unknown as RoomRow[]).map<ConfigurationRoom>((row) => ({
        id: row.id,
        roomTypeId: row.room_type_id,
        code: row.code,
        displayName: row.display_name,
        capacity: row.capacity,
        status: row.status,
        sector: row.sector ?? "",
        internalNotes: row.internal_notes ?? "",
        serviceIds: serviceAssignmentRows.filter((item) => item.room_id === row.id).map((item) => item.service_id),
        active: row.active,
      })),
      beds: ((beds.data ?? []) as unknown as BedRow[]).map<ConfigurationBed>((row) => ({
        id: row.id,
        roomId: row.room_id,
        code: row.code,
        bedType: row.bed_type,
        quantity: row.quantity ?? 1,
        capacity: row.capacity,
        active: row.active,
      })),
      services: ((serviceProbe.data ?? []) as RoomServiceRow[]).map<ConfigurationRoomService>((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description ?? "",
        isSystem: row.is_system,
        active: row.active,
      })),
      profiles: ((profiles.data ?? []) as ProfileRow[]).map<ConfigurationProfile>((row) => ({
        id: row.id,
        displayName: row.display_name,
        phone: row.phone ?? "",
        status: row.status,
        roleIds: userRoleRows.filter((item) => item.user_id === row.id).map((item) => item.role_id),
        createdAt: row.created_at,
      })),
      roles: ((roles.data ?? []) as RoleRow[]).map<ConfigurationRole>((row) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        description: row.description ?? "",
        isSystem: row.is_system,
        permissionIds: rolePermissionRows.filter((item) => item.role_id === row.id).map((item) => item.permission_id),
      })),
      permissions: ((permissions.data ?? []) as PermissionRow[]).map<ConfigurationPermission>((row) => ({
        id: row.id,
        code: row.code,
        description: row.description,
      })),
    };
  }

  private async saveSetting<T>(
    key: string,
    value: T,
    description: string,
    updatedBy: string,
  ): Promise<void> {
    const { error } = await this.client.from("settings").upsert({
      key,
      value,
      description,
      is_public: false,
      updated_by: updatedBy,
    }, { onConflict: "key" });
    databaseError(error, "No fue posible guardar la configuración.");
  }

  saveGeneral(input: GeneralInput, userId: string) {
    return this.saveSetting(SETTINGS.general, generalSettingsSchema.parse(input), "Información general del hostel.", userId);
  }

  saveSchedules(input: ScheduleInput, userId: string) {
    return this.saveSetting(SETTINGS.schedules, scheduleSettingsSchema.parse(input), "Horarios operativos de check-in, check-out y descanso.", userId);
  }

  savePrice(input: PriceInput, userId: string) {
    return this.saveSetting(SETTINGS.price, priceSettingsSchema.parse(input), "Precio base interno en pesos argentinos.", userId);
  }

  savePolicies(input: PolicyInput, userId: string) {
    return this.saveSetting(SETTINGS.policies, policySettingsSchema.parse(input), "Políticas internas aprobadas del hostel.", userId);
  }

  async createRoomType(input: Omit<RoomTypeInput, "id">): Promise<void> {
    const value = roomTypeInputSchema.omit({ id: true }).parse(input);
    const { error } = await this.client.from("room_types").insert({
      code: value.code,
      name: value.internalName,
      public_name: value.publicName,
      description: value.description || null,
      default_capacity: value.defaultCapacity,
      base_rate: value.baseRate,
      active: value.active,
    });
    databaseError(error, "No fue posible crear el tipo de habitación.");
  }

  async updateRoomType(input: RoomTypeInput): Promise<void> {
    const value = roomTypeInputSchema.required({ id: true }).parse(input);
    const { error } = await this.client.from("room_types").update({
      code: value.code,
      name: value.internalName,
      public_name: value.publicName,
      description: value.description || null,
      default_capacity: value.defaultCapacity,
      base_rate: value.baseRate,
      active: value.active,
    }).eq("id", value.id).select("id").single();
    databaseError(error, "No fue posible actualizar el tipo de habitación.");
  }

  async createRoom(input: Omit<RoomInput, "id">): Promise<void> {
    const value = roomInputSchema.omit({ id: true }).parse(input);
    if (value.status !== "out_of_service") {
      throw new Error("Toda habitación nueva debe crearse fuera de servicio.");
    }
    const { error } = await this.client.from("rooms").insert({
      room_type_id: value.roomTypeId,
      code: value.code,
      display_name: value.displayName,
      capacity: value.capacity,
      sector: value.sector || null,
      internal_notes: value.internalNotes || null,
      status: "out_of_service",
      status_note: "Pendiente de habilitación operativa.",
      active: value.active,
    });
    databaseError(error, "No fue posible crear la habitación.");
  }

  async updateRoom(input: RoomInput): Promise<void> {
    const value = roomInputSchema.required({ id: true }).parse(input);
    if (!value.active && value.status !== "out_of_service") {
      throw new Error("Una habitación inactiva debe permanecer fuera de servicio.");
    }
    const { data: current, error: currentError } = await this.client.from("rooms").select("status").eq("id", value.id).single();
    databaseError(currentError, "No fue posible validar el estado actual de la habitación.");
    if (current?.status !== value.status) {
      const { error: statusError } = await this.client.rpc("set_room_operational_status", {
        p_room_id: value.id,
        p_status: value.status,
        p_reason: "Estado actualizado desde Configuración.",
      });
      databaseError(statusError, "No fue posible actualizar el estado operativo de la habitación.");
    }
    const { error } = await this.client.from("rooms").update({
      room_type_id: value.roomTypeId,
      code: value.code,
      display_name: value.displayName,
      capacity: value.capacity,
      sector: value.sector || null,
      internal_notes: value.internalNotes || null,
      active: value.active,
    }).eq("id", value.id).select("id").single();
    databaseError(error, "No fue posible actualizar la habitación.");
  }

  async createBed(input: Omit<BedInput, "id">): Promise<void> {
    const value = bedInputSchema.omit({ id: true }).parse(input);
    const { error } = await this.client.from("beds").insert({
      room_id: value.roomId,
      code: value.code,
      bed_type: value.bedType,
      quantity: value.quantity,
      capacity: value.capacity,
      active: value.active,
    });
    databaseError(error, "No fue posible crear la cama.");
  }

  async updateBed(input: BedInput): Promise<void> {
    const value = bedInputSchema.required({ id: true }).parse(input);
    const { error } = await this.client.from("beds").update({
      room_id: value.roomId,
      code: value.code,
      bed_type: value.bedType,
      quantity: value.quantity,
      capacity: value.capacity,
      active: value.active,
    }).eq("id", value.id).select("id").single();
    databaseError(error, "No fue posible actualizar la cama.");
  }

  async createRoomService(input: RoomServiceInput): Promise<void> {
    const value = roomServiceInputSchema.parse(input);
    const { error } = await this.client.from("room_services").insert({
      code: value.code,
      name: value.name,
      description: value.description || null,
      is_system: false,
      active: value.active,
    });
    databaseError(error, "No fue posible crear el servicio de habitación.");
  }

  async saveRoomServices(input: RoomServiceAssignmentInput): Promise<void> {
    const value = roomServiceAssignmentSchema.parse(input);
    const selectedIds = [...new Set(value.serviceIds)];
    const [{ data: validServices, error: servicesError }, { data: current, error: currentError }] = await Promise.all([
      selectedIds.length
        ? this.client.from("room_services").select("id").eq("active", true).in("id", selectedIds)
        : Promise.resolve({ data: [], error: null }),
      this.client.from("room_service_assignments").select("service_id").eq("room_id", value.roomId),
    ]);
    databaseError(servicesError, "No fue posible validar los servicios seleccionados.");
    databaseError(currentError, "No fue posible cargar los servicios actuales.");
    if ((validServices ?? []).length !== selectedIds.length) throw new Error("Uno de los servicios seleccionados no está disponible.");

    const currentIds = ((current ?? []) as Array<{ service_id: string }>).map((item) => item.service_id);
    const toAdd = selectedIds.filter((id) => !currentIds.includes(id));
    const toRemove = currentIds.filter((id) => !selectedIds.includes(id));
    if (toAdd.length) {
      const { error } = await this.client.from("room_service_assignments").insert(toAdd.map((serviceId) => ({
        room_id: value.roomId,
        service_id: serviceId,
      })));
      databaseError(error, "No fue posible asignar los servicios.");
    }
    if (toRemove.length) {
      const { error } = await this.client.from("room_service_assignments").delete().eq("room_id", value.roomId).in("service_id", toRemove);
      databaseError(error, "No fue posible retirar los servicios anteriores.");
    }
  }

  async saveUser(input: ProfileInput, actor: { id: string; roles: string[] }): Promise<void> {
    const value = profileInputSchema.parse(input);
    const selectedRoleIds = [...new Set(value.roleIds)];
    const [{ data: selectedRoles, error: selectedRolesError }, { data: currentAssignments, error: currentError }] =
      await Promise.all([
        this.client.from("roles").select("id,code").in("id", selectedRoleIds),
        this.client.from("user_roles").select("role_id,roles(code)").eq("user_id", value.userId),
      ]);
    databaseError(selectedRolesError, "No fue posible validar los roles seleccionados.");
    databaseError(currentError, "No fue posible validar los roles actuales.");

    const validRoles = (selectedRoles ?? []) as Array<{ id: string; code: string }>;
    if (validRoles.length !== selectedRoleIds.length) throw new Error("Uno de los roles seleccionados ya no existe.");

    const currentRows = (currentAssignments ?? []) as Array<{
      role_id: string;
      roles: { code: string } | Array<{ code: string }> | null;
    }>;
    const currentCodes = currentRows.flatMap((row) => Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []).map((role) => role.code);
    const selectedCodes = validRoles.map((role) => role.code);
    const targetIsOwner = currentCodes.includes("owner");

    if (value.userId === actor.id && value.status !== "active") {
      throw new Error("No podés desactivar tu propio perfil.");
    }
    if (value.userId === actor.id && actor.roles.includes("owner") && !selectedCodes.includes("owner")) {
      throw new Error("No podés quitarte el rol owner.");
    }
    if (targetIsOwner && (value.status !== "active" || !selectedCodes.includes("owner"))) {
      throw new Error("Un perfil owner debe permanecer activo y conservar ese rol.");
    }

    const currentRoleIds = currentRows.map((row) => row.role_id);
    const toAdd = selectedRoleIds.filter((id) => !currentRoleIds.includes(id));
    const toRemove = currentRoleIds.filter((id) => !selectedRoleIds.includes(id));

    if (toAdd.length) {
      const { error } = await this.client.from("user_roles").insert(toAdd.map((roleId) => ({
        user_id: value.userId,
        role_id: roleId,
        assigned_by: actor.id,
      })));
      databaseError(error, "No fue posible asignar los roles.");
    }
    if (toRemove.length) {
      const { error } = await this.client.from("user_roles").delete().eq("user_id", value.userId).in("role_id", toRemove);
      databaseError(error, "No fue posible retirar los roles anteriores.");
    }

    const { error } = await this.client.from("profiles").update({
      display_name: value.displayName,
      phone: value.phone || null,
      status: value.status,
    }).eq("id", value.userId).select("id").single();
    databaseError(error, "No fue posible actualizar el perfil.");
  }
}
