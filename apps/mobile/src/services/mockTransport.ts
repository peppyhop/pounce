/**
 * MockTransport — an in-app stand-in for the alleycat daemon so Pounce is fully
 * functional with no host paired (demo mode, App Store reviewers, offline first
 * launch). It implements the real {@link Transport} interface and emits genuine
 * seq-numbered {@link WireEnvelope}s, so it exercises the exact adapter path the
 * real transports use — streaming deltas, tool calls, turn completion, replay.
 *
 * Demo convention: a conversation's `threadId` equals its id, so `createRun`
 * (which only receives `threadId`) can route emitted events to the right log.
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
  WirePayload,
} from "@litter/shared";
import type {
  ConnectionState,
  SubscribeOptions,
  Transport,
} from "@litter/runtime";

type Push = (e: WireEnvelope) => void;

const DEMO_AGENTS: readonly AgentInfo[] = [
  agent("claude", "Claude", true),
  agent("codex", "Codex", true),
  agent("opencode", "OpenCode", true),
  agent("grok", "Grok", false),
];

function agent(id: AgentInfo["id"], displayName: string, available: boolean): AgentInfo {
  return {
    id,
    displayName,
    available,
    presentation: "cli",
    capabilities: {
      streaming: true,
      tools: true,
      images: true,
      thinking: true,
      terminal: true,
      git: true,
    },
  };
}

export class MockTransport implements Transport {
  readonly kind = "http" as const;

  #seq = 0;
  #log = new Map<string, WireEnvelope[]>();
  #subs = new Map<string, Set<Push>>();
  #timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(seed: Record<string, WireEnvelope[]> = {}) {
    for (const [cid, events] of Object.entries(seed)) {
      this.#log.set(cid, [...events]);
      for (const e of events) this.#seq = Math.max(this.#seq, e.seq);
    }
  }

  async connect(_pairing: PairPayload): Promise<HostStatus> {
    return {
      pid: 0,
      tokenShort: "demo",
      configPath: "~/demo/host.toml",
      uptimeSecs: 0,
      version: "demo",
      hostName: "Demo Host",
      nodeId: "demo-node",
      relayConnected: true,
    };
  }
  async disconnect(): Promise<void> {
    for (const t of this.#timers) clearTimeout(t);
    this.#timers.clear();
  }
  onStateChange(cb: (s: ConnectionState) => void): () => void {
    cb("connected");
    return () => {};
  }

  async listAgents(): Promise<readonly AgentInfo[]> {
    return DEMO_AGENTS;
  }

  async createRun(req: CreateRunRequest): Promise<CreateRunResponse> {
    const cid = req.threadId ?? "demo";
    const runId = `run_${cid}_${this.#seq + 1}`;
    this.#emit(cid, { type: "UserEnvelope", message: req.input.text });
    this.#scriptReply(cid, runId, req.input.text);
    return {
      runId,
      threadId: cid,
      seq: { currentSeq: this.#seq, floorSeq: 1 },
    };
  }

  async controlRun(_req: RunControlRequest): Promise<void> {}

  async *subscribe(opts: SubscribeOptions): AsyncIterable<WireEnvelope> {
    const cid = opts.conversationId ?? "demo";
    const since = opts.sinceSeq ?? 0;
    // Replay buffered history first.
    for (const e of (this.#log.get(cid) ?? []).filter((e) => e.seq > since)) {
      yield e;
    }
    // Then live.
    const pending: WireEnvelope[] = [];
    let notify: (() => void) | null = null;
    const push: Push = (e) => {
      pending.push(e);
      notify?.();
    };
    let set = this.#subs.get(cid);
    if (!set) {
      set = new Set();
      this.#subs.set(cid, set);
    }
    set.add(push);

    let aborted = false;
    opts.signal?.addEventListener(
      "abort",
      () => {
        aborted = true;
        notify?.();
      },
      { once: true },
    );

    try {
      while (!aborted) {
        if (pending.length) {
          yield pending.shift()!;
          continue;
        }
        await new Promise<void>((r) => {
          notify = () => {
            notify = null;
            r();
          };
        });
      }
    } finally {
      set.delete(push);
    }
  }

  // --- terminal / git: realistic demo responses ---
  async exec(_req: ExecRequest): Promise<{ readonly terminalId: string }> {
    return { terminalId: `term_${this.#seq}` };
  }
  async execWrite(_req: ExecWriteRequest): Promise<void> {}
  async execResize(_req: ExecResizeRequest): Promise<void> {}
  async execTerminate(_id: string): Promise<void> {}
  async gitStatus(_req: GitStatusRequest): Promise<unknown> {
    return { branch: "main", files: [] };
  }
  async gitDiff(_req: DiffRequest): Promise<string> {
    return "diff --git a/README.md b/README.md\n+Pounce demo diff";
  }
  async gitCommit(_req: GitCommitRequest): Promise<void> {}

  // --- internals ---

  #emit(cid: string, payload: WirePayload): WireEnvelope {
    const env: WireEnvelope = {
      seq: ++this.#seq,
      runId: `run_${cid}`,
      ts: Date.now(),
      payload,
    };
    const log = this.#log.get(cid) ?? [];
    log.push(env);
    this.#log.set(cid, log);
    for (const p of this.#subs.get(cid) ?? []) p(env);
    return env;
  }

  #after(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.#timers.delete(t);
      fn();
    }, ms);
    this.#timers.add(t);
  }

  /** Produce a believable streamed reply with a tool call in the middle. */
  #scriptReply(cid: string, _runId: string, prompt: string): void {
    const reply = composeReply(prompt);
    const chunks = chunkText(reply.head, 14);
    const tail = chunkText(reply.tail, 14);
    let t = 220;
    const step = 60;

    this.#after(t, () => this.#emit(cid, { type: "ThinkingDelta", text: "" }));
    t += 380;

    for (const c of chunks) {
      this.#after(t, () =>
        this.#emit(cid, { type: "ContentBlockDelta", index: 0, delta: { text: c } }),
      );
      t += step;
    }

    const toolId = `tool_${cid}_${Date.now()}`;
    this.#after(t, () =>
      this.#emit(cid, {
        type: "ToolCall",
        toolCallId: toolId,
        toolName: reply.tool.name,
        arguments: reply.tool.args,
      }),
    );
    t += 700;
    this.#after(t, () =>
      this.#emit(cid, {
        type: "ToolResult",
        toolUseId: toolId,
        content: reply.tool.result,
      }),
    );
    t += 300;

    for (const c of tail) {
      this.#after(t, () =>
        this.#emit(cid, { type: "ContentBlockDelta", index: 0, delta: { text: c } }),
      );
      t += step;
    }
    this.#after(t + 200, () =>
      this.#emit(cid, { type: "turn/completed", durationMs: t }),
    );
  }
}

function composeReply(prompt: string): {
  head: string;
  tail: string;
  tool: { name: string; args: unknown; result: unknown };
} {
  const p = prompt.toLowerCase();
  if (p.includes("test")) {
    return {
      head: "I'll run the test suite and check what's failing. ",
      tail: "All 42 tests pass now — the flaky timeout in `auth.test.ts` was the culprit.",
      tool: {
        name: "Bash",
        args: { command: "pnpm test" },
        result: "Test Suites: 6 passed, 6 total\nTests: 42 passed",
      },
    };
  }
  if (p.includes("fix") || p.includes("bug")) {
    return {
      head: "Let me locate the bug. I'll search for the relevant handler first. ",
      tail: "Found it — an unawaited promise in `runtime.ts:84`. I've added the `await` and the race is gone.",
      tool: {
        name: "Grep",
        args: { pattern: "createRun", path: "packages/runtime" },
        result: "packages/runtime/src/client.ts:78\npackages/runtime/src/adapter/litterAdapter.ts:40",
      },
    };
  }
  return {
    head: "Sure — let me take a look at the project structure to ground my answer. ",
    tail: "This is a monorepo: the UI lives in `apps/mobile` and the runtime adapter in `packages/runtime`. Want me to start a task?",
    tool: {
      name: "Read",
      args: { file_path: "README.md" },
      result: "# Pounce\nA mobile client for the Litter runtime…",
    },
  };
}

function chunkText(text: string, size: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let buf = "";
  for (const w of words) {
    buf += (buf ? " " : "") + w;
    if (buf.length >= size) {
      out.push(buf + " ");
      buf = "";
    }
  }
  if (buf) out.push(buf);
  return out;
}
