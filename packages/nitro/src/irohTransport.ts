/**
 * IrohTransport — implements the runtime Transport over the NitroLitter native
 * module. Same interface as HttpTransport, so LitterAdapter is transport-blind.
 *
 * The native side embeds the Iroh QUIC client; here we marshal JSON across the
 * Nitro bridge and turn the callback-based `subscribe` into an async iterable.
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
import type {
  ConnectionState,
  SubscribeOptions,
  Transport,
} from "@litter/runtime";
import type { NitroLitter } from "./NitroLitter.nitro";

export class IrohTransport implements Transport {
  readonly kind = "iroh" as const;
  #native: NitroLitter;

  constructor(native: NitroLitter) {
    this.#native = native;
  }

  async connect(pairing: PairPayload): Promise<HostStatus> {
    const json = await this.#native.connect(JSON.stringify(pairing));
    return JSON.parse(json) as HostStatus;
  }
  disconnect(): Promise<void> {
    return this.#native.disconnect();
  }
  onStateChange(cb: (s: ConnectionState) => void): () => void {
    return this.#native.onConnectionStateChange((s) => cb(s as ConnectionState));
  }

  async listAgents(): Promise<readonly AgentInfo[]> {
    return JSON.parse(await this.#native.listAgents()) as AgentInfo[];
  }

  async createRun(req: CreateRunRequest): Promise<CreateRunResponse> {
    return JSON.parse(await this.#native.createTask(JSON.stringify(req)));
  }
  controlRun(req: RunControlRequest): Promise<void> {
    switch (req.action) {
      case "pause":
        return this.#native.pauseTask(req.runId);
      case "resume":
        return this.#native.resumeTask(req.runId);
      default:
        return this.#native.cancelTask(req.runId);
    }
  }

  subscribe(opts: SubscribeOptions): AsyncIterable<WireEnvelope> {
    const native = this.#native;
    const conversationId = opts.conversationId ?? "";
    const sinceSeq = opts.sinceSeq ?? -1;

    return {
      [Symbol.asyncIterator](): AsyncIterator<WireEnvelope> {
        const queue: WireEnvelope[] = [];
        let waiting: ((r: IteratorResult<WireEnvelope>) => void) | null = null;
        let done = false;
        let error: Error | null = null;

        const push = (env: WireEnvelope) => {
          if (waiting) {
            waiting({ value: env, done: false });
            waiting = null;
          } else queue.push(env);
        };

        const subId = native.subscribe(
          conversationId,
          sinceSeq,
          (json) => push(JSON.parse(json) as WireEnvelope),
          (msg) => {
            error = new Error(msg);
            done = true;
            if (waiting) {
              waiting({ value: undefined as never, done: true });
              waiting = null;
            }
          },
        );

        const cleanup = () => {
          done = true;
          native.unsubscribe(subId);
        };
        opts.signal?.addEventListener("abort", cleanup, { once: true });

        return {
          next() {
            if (error) return Promise.reject(error);
            const next = queue.shift();
            if (next) return Promise.resolve({ value: next, done: false });
            if (done) return Promise.resolve({ value: undefined as never, done: true });
            return new Promise((resolve) => (waiting = resolve));
          },
          return() {
            cleanup();
            return Promise.resolve({ value: undefined as never, done: true });
          },
        };
      },
    };
  }

  async exec(req: ExecRequest): Promise<{ readonly terminalId: string }> {
    const id = await this.#native.createTerminal(JSON.stringify(req), () => {});
    return { terminalId: id };
  }
  execWrite(req: ExecWriteRequest): Promise<void> {
    return this.#native.executeCommand(req.terminalId, req.data);
  }
  execResize(req: ExecResizeRequest): Promise<void> {
    return this.#native.resizeTerminal(req.terminalId, req.cols, req.rows);
  }
  execTerminate(terminalId: string): Promise<void> {
    return this.#native.closeTerminal(terminalId);
  }

  gitStatus(req: GitStatusRequest): Promise<unknown> {
    return this.#native.getGitStatus(JSON.stringify(req)).then(JSON.parse);
  }
  gitDiff(req: DiffRequest): Promise<string> {
    return this.#native.getDiff(JSON.stringify(req));
  }
  gitCommit(req: GitCommitRequest): Promise<void> {
    return this.#native.commit(JSON.stringify(req));
  }
}
