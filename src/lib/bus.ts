import { EventEmitter } from "node:events";

// In-process pub/sub that feeds the Server-Sent Events streams (kitchen screen, diner status page).
const g = globalThis as unknown as { __bus?: EventEmitter };
export const bus = g.__bus ?? (g.__bus = new EventEmitter().setMaxListeners(500));

export const publish = (restaurantId: string, orderId: string, type: string) => {
  bus.emit(`r:${restaurantId}`, { orderId, type });
  bus.emit(`o:${orderId}`, { orderId, type });
};
