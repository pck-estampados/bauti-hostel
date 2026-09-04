import type { RoomStatus } from "../lib/types";
import type { z } from "zod";
import type { generalSettingsSchema, scheduleSettingsSchema, policySettingsSchema } from "../../lib/core-settings";

export type ProfileStatus = "pending" | "active" | "disabled";
export type BedType = "single" | "double" | "bunk_single" | "crib" | "other";

export type GeneralSettings = z.infer<typeof generalSettingsSchema>;
export type ScheduleSettings = z.infer<typeof scheduleSettingsSchema>;

export type PriceSettings = {
  amount: number;
  currency: "ARS";
};

export type PolicySettings = z.infer<typeof policySettingsSchema>;

export type StoredSetting<T> = {
  value: T;
  updatedAt: string;
};

export type ConfigurationRoomType = {
  id: string;
  code: string;
  internalName: string;
  publicName: string;
  description: string;
  defaultCapacity: number;
  baseRate: number | null;
  active: boolean;
};

export type ConfigurationRoom = {
  id: string;
  roomTypeId: string | null;
  code: string;
  displayName: string;
  capacity: number;
  status: RoomStatus;
  sector: string;
  internalNotes: string;
  serviceIds: string[];
  active: boolean;
};

export type ConfigurationBed = {
  id: string;
  roomId: string;
  code: string;
  bedType: BedType;
  quantity: number;
  capacity: number;
  active: boolean;
};

export type ConfigurationRoomService = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  active: boolean;
};

export type ConfigurationPermission = {
  id: string;
  code: string;
  description: string;
};

export type ConfigurationRole = {
  id: string;
  code: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissionIds: string[];
};

export type ConfigurationProfile = {
  id: string;
  displayName: string;
  phone: string;
  status: ProfileStatus;
  roleIds: string[];
  createdAt: string;
};

export type ConfigurationSnapshot = {
  inventorySchemaReady: boolean;
  settings: {
    general: StoredSetting<GeneralSettings> | null;
    schedules: StoredSetting<ScheduleSettings> | null;
    price: StoredSetting<PriceSettings> | null;
    policies: StoredSetting<PolicySettings> | null;
  };
  roomTypes: ConfigurationRoomType[];
  rooms: ConfigurationRoom[];
  beds: ConfigurationBed[];
  services: ConfigurationRoomService[];
  profiles: ConfigurationProfile[];
  roles: ConfigurationRole[];
  permissions: ConfigurationPermission[];
};

export function emptyConfigurationSnapshot(): ConfigurationSnapshot {
  return {
    inventorySchemaReady: false,
    settings: { general: null, schedules: null, price: null, policies: null },
    roomTypes: [],
    rooms: [],
    beds: [],
    services: [],
    profiles: [],
    roles: [],
    permissions: [],
  };
}
