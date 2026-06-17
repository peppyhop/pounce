/**
 * @litter/runtime — the Litter compatibility/adapter layer.
 *
 * Public surface: the LitterRuntime facade + transports. The app depends only
 * on LitterRuntime and the @litter/shared domain types; wire details stay here.
 */
export { LitterRuntime } from "./client";
export type { SendMessageInput } from "./client";
export { LitterAdapter } from "./adapter/litterAdapter";
export { translate, HANDLED_WIRE_TYPES } from "./adapter/translate";
export { HttpTransport, TransportError } from "./transport/httpTransport";
export type { HttpTransportConfig } from "./transport/httpTransport";
export type {
  Transport,
  ConnectionState,
  SubscribeOptions,
} from "./transport/types";
