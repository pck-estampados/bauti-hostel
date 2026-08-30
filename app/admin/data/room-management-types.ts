import type { RoomStatus } from "../lib/types";
import type { BedType } from "./configuration-types";

export type ManagedRoomType = {
  id: string;
  code: string;
  internalName: string;
  publicName: string;
  description: string;
  defaultCapacity: number;
  baseRate: number;
  active: boolean;
};

export type ManagedRoom = {
  id: string;
  roomTypeId: string;
  code: string;
  displayName: string;
  capacity: number;
  status: RoomStatus;
  sector: string;
  internalNotes: string;
  active: boolean;
  bedCapacity: number;
  serviceIds: string[];
};

export type ManagedBed = {
  id: string;
  roomId: string;
  code: string;
  bedType: BedType;
  quantity: number;
  capacity: number;
  active: boolean;
};

export type ManagedRoomService = {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type RoomInventoryReadModel = {
  roomId: string;
  active: boolean;
  status: RoomStatus;
  configuredCapacity: number;
  activeBeds: number;
  bedCapacity: number;
  assignedServices: ManagedRoomService[];
};

export type RoomManagementSnapshot = {
  roomTypes: ManagedRoomType[];
  rooms: ManagedRoom[];
  beds: ManagedBed[];
  services: ManagedRoomService[];
  serviceCount: number;
};

export const emptyRoomManagementSnapshot = (): RoomManagementSnapshot => ({
  roomTypes: [],
  rooms: [],
  beds: [],
  services: [],
  serviceCount: 0,
});
