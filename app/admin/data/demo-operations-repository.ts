import { createDemoOperationsState, DEMO_OPERATOR } from "../lib/demo-data";
import {
  addGuest,
  cancelReservation,
  addInternalNote,
  createManualReservation,
  createWalkIn,
  performCheckIn,
  performCheckOut,
  registerPayment,
  setRoomStatus,
  updateGuest,
  updateReservation,
  voidPayment,
} from "../lib/operations";
import type { OperationsState } from "../lib/types";
import type { OperationsRepository } from "./operations-repository";

export class DemoOperationsRepository implements OperationsRepository {
  private state: OperationsState = createDemoOperationsState();

  constructor(private readonly actor = DEMO_OPERATOR) {}

  async loadSnapshot() { return structuredClone(this.state); }
  async addGuest(input: Parameters<OperationsRepository["addGuest"]>[0]) {
    this.state = addGuest(this.state, input, this.actor); return this.loadSnapshot();
  }
  async updateGuest(guestId: string, input: Parameters<OperationsRepository["updateGuest"]>[1]) {
    this.state = updateGuest(this.state, guestId, input, this.actor); return this.loadSnapshot();
  }
  async createWalkIn(input: Parameters<OperationsRepository["createWalkIn"]>[0]) {
    this.state = createWalkIn(this.state, input, this.actor); return this.loadSnapshot();
  }
  async createReservation(input: Parameters<OperationsRepository["createReservation"]>[0]) {
    this.state = createManualReservation(this.state, input, this.actor); return this.loadSnapshot();
  }
  async updateReservation(input: Parameters<OperationsRepository["updateReservation"]>[0]) {
    this.state = updateReservation(this.state, input, this.actor); return this.loadSnapshot();
  }
  async cancelReservation(reservationId: string, reason: string) {
    this.state = cancelReservation(this.state, reservationId, reason, this.actor); return this.loadSnapshot();
  }
  async checkIn(reservationId: string) {
    this.state = performCheckIn(this.state, reservationId, this.actor); return this.loadSnapshot();
  }
  async checkOut(reservationId: string) {
    this.state = performCheckOut(this.state, reservationId, this.actor); return this.loadSnapshot();
  }
  async registerPayment(input: Parameters<OperationsRepository["registerPayment"]>[0]) {
    this.state = registerPayment(this.state, input, this.actor); return this.loadSnapshot();
  }
  async voidPayment(paymentId: string, reason: string) {
    this.state = voidPayment(this.state, paymentId, reason, this.actor); return this.loadSnapshot();
  }
  async addNote(input: Parameters<OperationsRepository["addNote"]>[0]) {
    this.state = addInternalNote(this.state, input, this.actor); return this.loadSnapshot();
  }
  async changeRoomStatus(roomId: string, status: Parameters<OperationsRepository["changeRoomStatus"]>[1]) {
    this.state = setRoomStatus(this.state, roomId, status, this.actor); return this.loadSnapshot();
  }
}
