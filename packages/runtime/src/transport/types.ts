/**
 * Transport abstraction.
 *
 * Two concrete transports implement this:
 *   - HttpTransport  — fetch + SSE against the daemon's local `/v1/runs` +
 *                      `/events`. Runnable today over LAN / a tunnel.
 *   - IrohTransport  — the production p2p path, backed by the NitroLitter
 *                      native module (Iroh QUIC client). Same interface, so the
 *                      adapter and app are transport-agnostic.
 *
 * Everything below speaks the *wire* protocol (@litter/shared/protocol). The
 * adapter is responsible for translating to the stable domain model.
 */

import type {
  AgentInfo,
  CreateRunRequest,
  CreateRunResponse,
  DiffRequest,
  ExecRequest,
  ExecResizeRequest,
  ExecWriteRequest,
  GitCommitRequest,
  GitStatusRequest,
  HostStatus,
  PairPayload,
  RunControlRequest,
  WireEnvelope,
} from "@litter/shared";

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting";

export interface SubscribeOptions {
  readonly runId?: string;
  readonly conversationId?: string;
  /**
   * Resume from this seq (exclusive). The daemon replays buffered events with
   * seq > sinceSeq, then continues live. This is the reconnect/offline-catchup
   * mechanism (`SessionInfo.floorSeq`..`currentSeq`).
   */
  readonly sinceSeq?: number;
  readonly signal?: AbortSignal;
}

export interface Transport {
  readonly kind: "http" | "iroh";

  connect(pairing: PairPayload): Promise<HostStatus>;
  disconnect(): Promise<void>;
  onStateChange(cb: (state: ConnectionState) => void): () => void;

  listAgents(): Promise<readonly AgentInfo[]>;

  createRun(req: CreateRunRequest): Promise<CreateRunResponse>;
  controlRun(req: RunControlRequest): Promise<void>;

  /** Hot event stream, resumable via {@link SubscribeOptions.sinceSeq}. */
  subscribe(opts: SubscribeOptions): AsyncIterable<WireEnvelope>;

  // Terminal (shell-bridge / CommandExec*)
  exec(req: ExecRequest): Promise<{ readonly terminalId: string }>;
  execWrite(req: ExecWriteRequest): Promise<void>;
  execResize(req: ExecResizeRequest): Promise<void>;
  execTerminate(terminalId: string): Promise<void>;

  // Git/review surface
  gitStatus(req: GitStatusRequest): Promise<unknown>;
  gitDiff(req: DiffRequest): Promise<string>;
  gitCommit(req: GitCommitRequest): Promise<void>;
}
