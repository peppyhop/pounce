/**
 * NitroLitter — the native module spec (Nitrogen codegen input).
 *
 * Backed natively by an embedded Iroh QUIC client (Rust, cross-compiled to a
 * static lib via uniffi/cxx and linked into the Swift/Kotlin HybridObject). The
 * native side dials the paired alleycat daemon by `node_id` + `relay`, then
 * speaks the same JSON run/event protocol as HttpTransport — so JS sees one
 * consistent surface.
 *
 * IMPORTANT: all params/returns are JSON strings of @litter/shared types. We
 * pass JSON across the bridge (not bespoke Nitro structs) so the wire schema can
 * evolve in @litter/shared without regenerating native code on every change —
 * the upgrade-compatibility requirement. Streaming uses Nitro callbacks.
 *
 * Run `pnpm --filter @litter/nitro codegen` to regenerate nitrogen bindings.
 */

import type { HybridObject } from "react-native-nitro-modules";

export interface NitroLitter
  extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  // --- lifecycle / pairing ---

  /** Import a PairPayload (JSON) and dial the daemon over Iroh. Returns HostStatus JSON. */
  connect(pairPayloadJson: string): Promise<string>;
  disconnect(): Promise<void>;

  /** "disconnected" | "connecting" | "connected" | "reconnecting". */
  getConnectionState(): string;
  onConnectionStateChange(listener: (state: string) => void): () => void;

  /** Returns AgentInfo[] JSON. */
  listAgents(): Promise<string>;

  // --- projects / conversations ---

  /** CreateProjectInput JSON -> Project JSON. */
  createProject(inputJson: string): Promise<string>;
  /** path -> Project JSON (binds a host directory). */
  openProject(hostId: string, path: string): Promise<string>;

  createConversation(projectId: string, agent: string): Promise<string>;
  deleteConversation(conversationId: string): Promise<void>;

  /** SendMessageInput JSON -> { runId, threadId } JSON. */
  sendMessage(inputJson: string): Promise<string>;

  // --- tasks ---

  /** CreateRunRequest JSON -> CreateRunResponse JSON. */
  createTask(requestJson: string): Promise<string>;
  pauseTask(runId: string): Promise<void>;
  resumeTask(runId: string): Promise<void>;
  cancelTask(runId: string): Promise<void>;

  // --- event stream ---

  /**
   * Subscribe to a conversation's events. `onEvent` receives WireEnvelope JSON,
   * one per emission. Returns a subscription id; pass it to `unsubscribe`.
   * Resume is driven by `sinceSeq` (-1 = from live tail).
   */
  subscribe(
    conversationId: string,
    sinceSeq: number,
    onEvent: (envelopeJson: string) => void,
    onError: (message: string) => void,
  ): string;
  unsubscribe(subscriptionId: string): void;

  // --- repositories / git ---

  /** Returns Repository[] JSON for the host. */
  getRepositories(hostId: string): Promise<string>;
  /** GitStatusRequest JSON -> Repository JSON. */
  getGitStatus(requestJson: string): Promise<string>;
  /** DiffRequest JSON -> unified diff text. */
  getDiff(requestJson: string): Promise<string>;
  /** GitCommitRequest JSON -> void. */
  commit(requestJson: string): Promise<void>;
  /** Watch a repo for FS changes; `onChange` receives changed-path JSON arrays. */
  watchRepository(
    cwd: string,
    onChange: (pathsJson: string) => void,
  ): string;
  unwatchRepository(watchId: string): void;

  // --- terminal (shell-bridge) ---

  /** ExecRequest JSON -> terminalId. Streams output via the onData callback. */
  createTerminal(
    requestJson: string,
    onData: (chunkJson: string) => void,
  ): Promise<string>;
  executeCommand(terminalId: string, command: string): Promise<void>;
  resizeTerminal(terminalId: string, cols: number, rows: number): Promise<void>;
  closeTerminal(terminalId: string): Promise<void>;
}
