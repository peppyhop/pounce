/**
 * Runtime service — owns the single LitterRuntime instance and decides which
 * transport to use:
 *
 *   1. IrohTransport (via NitroLitter) when the native module is linked — the
 *      production p2p path.
 *   2. HttpTransport otherwise — works today over LAN / a tunnel, and is the
 *      fallback when running in Expo Go or before the native build exists.
 *
 * Pairing payloads are stored in the OS secure store, never MMKV.
 */
import * as SecureStore from "expo-secure-store";
import { HttpTransport, LitterRuntime } from "@litter/runtime";
import type { Transport } from "@litter/runtime";
import type { PairPayload } from "@litter/shared";
import { connection$ } from "../state/stores";
import { MockTransport } from "./mockTransport";
import { DEMO_HOST_ID, buildDemoLogs, seedDemoStores } from "./demo";
import { connectBridge, loadBridgeConfig } from "./bridge";

const PAIRING_KEY = "litter.pairing";
const HTTP_BASE_KEY = "litter.httpBase";

let runtime: LitterRuntime | null = null;

/**
 * Streaming-capable fetch. RN's stock fetch can't expose `response.body` as a
 * ReadableStream, which the SSE event reader needs. react-native-nitro-fetch is
 * a Nitro-backed fetch with true streaming, so we prefer it and fall back to the
 * global fetch (e.g. Expo Go) when the native module isn't linked.
 */
async function resolveFetch(): Promise<typeof fetch> {
  try {
    const { fetch: nitroFetch } = await import("react-native-nitro-fetch");
    return nitroFetch as unknown as typeof fetch;
  } catch {
    return globalThis.fetch;
  }
}

async function buildTransport(): Promise<Transport> {
  // Lazy import so Expo Go (no native module) doesn't crash at startup.
  try {
    const nitro = await import("@litter/nitro");
    if (nitro.isNitroLitterAvailable()) {
      return new nitro.IrohTransport(nitro.getNitroLitter());
    }
  } catch {
    // native module not present — fall through to HTTP
  }
  const baseUrl =
    (await SecureStore.getItemAsync(HTTP_BASE_KEY)) ?? "http://127.0.0.1:8389";
  return new HttpTransport({ baseUrl, fetchImpl: await resolveFetch() });
}

export async function getRuntime(): Promise<LitterRuntime> {
  if (runtime) return runtime;
  runtime = LitterRuntime.withTransport(await buildTransport());
  runtime.onConnectionStateChange((s) => connection$.status.set(s));
  return runtime;
}

export async function savePairing(p: PairPayload): Promise<void> {
  await SecureStore.setItemAsync(PAIRING_KEY, JSON.stringify(p));
}

export async function loadPairing(): Promise<PairPayload | null> {
  const raw = await SecureStore.getItemAsync(PAIRING_KEY);
  return raw ? (JSON.parse(raw) as PairPayload) : null;
}

export async function connectSaved(): Promise<boolean> {
  const pairing = await loadPairing();
  if (!pairing) return false;
  const rt = await getRuntime();
  connection$.status.set("connecting");
  try {
    const status = await rt.connect(pairing);
    connection$.activeHostId.set(status.nodeId);
    connection$.demo.set(false);
    return true;
  } catch {
    connection$.status.set("disconnected");
    return false;
  }
}

/**
 * Switch into demo mode: seed sample content and back the runtime with the
 * in-app {@link MockTransport}. Used when no real host is paired so the app is
 * fully functional on first launch / for App Store review.
 */
export async function startDemoMode(): Promise<void> {
  seedDemoStores();
  runtime = LitterRuntime.withTransport(new MockTransport(buildDemoLogs()));
  runtime.onConnectionStateChange((s) => connection$.status.set(s));
  await runtime.connect({
    nodeId: "demo-node",
    token: "demo",
    hostName: "Demo Host",
    relay: null,
  });
  connection$.demo.set(true);
  connection$.activeHostId.set(DEMO_HOST_ID);
  connection$.status.set("connected");
}

/** Refresh the current workspace (live sync if a bridge is configured). */
export async function refreshLive(): Promise<void> {
  const bridge = await loadBridgeConfig();
  if (bridge) {
    const { syncLiveData } = await import("./bridge");
    try { await syncLiveData(); } catch { /* keep cached */ }
  } else {
    seedDemoStores();
  }
}

/** App boot: live bridge → paired host → demo mode (first that succeeds). */
export async function bootstrap(): Promise<void> {
  const bridge = await loadBridgeConfig();
  if (bridge && (await connectBridge(bridge))) {
    const { registerForPush } = await import("./push");
    void registerForPush();
    return;
  }
  const pairing = await loadPairing();
  if (pairing && (await connectSaved())) return;
  await startDemoMode();
}

/** Leave demo mode after a real pairing is saved (forces transport rebuild). */
export function resetRuntime(): void {
  runtime = null;
}
