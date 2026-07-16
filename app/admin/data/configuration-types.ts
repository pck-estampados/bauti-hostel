import type { RoomStatus } from "../lib/types";

export type ProfileStatus = "pending" | "active" | "disabled";
export type BedType = "single" | "double" | "bunk_single" | "crib" | "other";

export type GeneralSettings = {
  name: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  province: string;
  website: string;
};

export type ScheduleSettings = {
  checkInFrom: string;
  checkInUntil: string;
  checkOutUntil: string;
  quietHoursFrom: string;
  quietHoursUntil: string;
};

export type PriceSettings = {
  amount: number;
  currency: "ARS";
};

export type PolicySettings = {
  cancellation: string;
  minors: string;
  pets: string;
  smoking: string;
  quietHours: string;
};

export type StoredSetting<T> = {
  value: T;
  updatedAt: string;
};

export type ConfigurationRoomType = {
  id: string;
  code: string;
  name: string;
  description: string;
  defaultCapacity: number;
  active: boolean;
};

export type ConfigurationRoom = {
  id: string;
  roomTypeId: string | null;
  code: string;
  displayName: string;
  capacity: number;
  status: RoomStatus;
  active: boolean;
};

export type ConfigurationBed = {
  id: string;
  roomId: string;
  code: string;
  bedType: BedType;
  capacity: number;
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
  settings: {
    general: StoredSetting<GeneralSettings> | null;
    schedules: StoredSetting<ScheduleSettings> | null;
    price: StoredSetting<PriceSettings> | null;
    policies: StoredSetting<PolicySettings> | null;
  };
  roomTypes: ConfigurationRoomType[];
  rooms: ConfigurationRoom[];
  beds: ConfigurationBed[];
  profiles: ConfigurationProfile[];
  roles: ConfigurationRole[];
  permissions: ConfigurationPermission[];
};

export function emptyConfigurationSnapshot(): ConfigurationSnapshot {
  return {
    settings: { general: null, schedules: null, price: null, policies: null },
    roomTypes: [],
    rooms: [],
    beds: [],
    profiles: [],
    roles: [],
    permissions: [],
  };
}
