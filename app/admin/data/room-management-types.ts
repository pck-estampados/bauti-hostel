import type { RoomStatus } from "../lib/types";

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
};

export type RoomManagementSnapshot = {
  roomTypes: ManagedRoomType[];
  rooms: ManagedRoom[];
  serviceCount: number;
};

export const emptyRoomManagementSnapshot = (): RoomManagementSnapshot => ({
  roomTypes: [],
  rooms: [],
  serviceCount: 0,
});
