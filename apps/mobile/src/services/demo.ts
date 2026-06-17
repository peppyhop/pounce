/**
 * Demo content for first launch / App Store review with no host paired.
 * Seeds repos + worktree-sessions (live and archived) so the worktree-aware IA
 * is visible without a backend. Flows through the same stores as live data.
 */
import type {
  ActivityStatus,
  Device,
  Host,
  Repository,
  Session,
  WireEnvelope,
} from "@litter/shared";
import { hosts$, setWorkspace } from "../state/stores";

export const DEMO_HOST_ID = "demo-host";

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;

interface Seed {
  id: string;
  repo: string;
  host: string; // device
  agent: Session["agent"];
  title: string;
  branch: string;
  activity: ActivityStatus;
  live: boolean;
  attention: boolean;
  ago: number;
}

const MINI = "Mac-mini";
const AIR = "MacBook-Air";

const SEEDS: Seed[] = [
  { id: "s_pay", repo: "peppyhop", host: MINI, agent: "claude", title: "Add idempotent retry to webhook handler", branch: "feat/payment-retry", activity: "running", live: true, attention: false, ago: 2 * MIN },
  { id: "s_auth", repo: "peppyhop", host: MINI, agent: "claude", title: "Fix auth redirect loop on token refresh", branch: "fix/auth-redirect", activity: "awaiting_input", live: true, attention: true, ago: 6 * MIN },
  { id: "s_geo", repo: "peppyhop", host: MINI, agent: "codex", title: "Geo filter on product search", branch: "feat/geo-filter", activity: "completed", live: true, attention: true, ago: 18 * MIN },
  { id: "s_cart", repo: "peppyhop", host: AIR, agent: "claude", title: "Prod bug: cart add-to fails on variant", branch: "fix/prod-bug-cart", activity: "failed", live: true, attention: true, ago: 40 * MIN },
  { id: "s_dep", repo: "peppyhop", host: MINI, agent: "opencode", title: "Bump dependencies + lockfile", branch: "chore/bump-deps", activity: "idle", live: false, attention: false, ago: 3 * HOUR },
  { id: "s_try", repo: "peppyhop", host: AIR, agent: "claude", title: "Try-on output rendering quirks", branch: "fix/try-on-output", activity: "idle", live: false, attention: false, ago: 26 * HOUR },
  { id: "s_brain", repo: "gigabrain", host: MINI, agent: "opencode", title: "Stream embeddings to the index worker", branch: "main", activity: "running", live: true, attention: false, ago: 12 * MIN },
  { id: "s_site", repo: "marketing-site", host: AIR, agent: "codex", title: "Dark mode polish on pricing page", branch: "feat/pricing-dark", activity: "completed", live: true, attention: true, ago: 50 * MIN },
];

export function seedDemoStores(): void {
  hosts$[DEMO_HOST_ID].set({
    id: DEMO_HOST_ID, nodeId: "demo-node", name: "Demo Host", online: true, lastSeenAt: iso(0),
  } satisfies Host);

  const repos: Record<string, Repository> = {};
  const sessions: Record<string, Session> = {};
  const devices: Record<string, Device> = {};
  for (const s of SEEDS) {
    const repoId = `repo:${s.repo}`;
    const hostId = `dev:${s.host}`;
    const ts = iso(s.ago);
    sessions[s.id] = {
      id: s.id, repoId, hostId, host: s.host, agent: s.agent, title: s.title,
      branch: s.branch, worktree: s.live ? s.branch : null,
      cwd: `~/.worktrees/${s.repo}/${s.branch}`, isLive: s.live,
      activity: s.activity, needsAttention: s.attention,
      createdAt: iso(s.ago + HOUR), updatedAt: ts,
    };
    const r = repos[repoId];
    repos[repoId] = r
      ? { ...r, sessionCount: r.sessionCount + 1, liveCount: r.liveCount + (s.live ? 1 : 0), attentionCount: r.attentionCount + (s.attention ? 1 : 0), lastActivityAt: ts > r.lastActivityAt ? ts : r.lastActivityAt }
      : { id: repoId, name: s.repo, sessionCount: 1, liveCount: s.live ? 1 : 0, attentionCount: s.attention ? 1 : 0, lastActivityAt: ts };
    const d = devices[hostId];
    devices[hostId] = d
      ? { ...d, sessionCount: d.sessionCount + 1, agents: [...new Set([...d.agents, s.agent])] }
      : { id: hostId, name: s.host, url: "", online: true, agents: [s.agent], sessionCount: 1, lastSyncAt: iso(0) };
  }
  setWorkspace(repos, sessions, devices);
}

/** Replayable demo history per session, for the mock transport. */
export function buildDemoLogs(): Record<string, WireEnvelope[]> {
  const env = (cid: string, payload: WireEnvelope["payload"], seq: number, tsAgo: number): WireEnvelope => ({
    seq,
    runId: `run_${cid}`,
    ts: now - tsAgo,
    payload,
  });
  return {
    s_pay: [
      env("s_pay", { type: "UserEnvelope", message: "Add an idempotency key to the webhook handler so Stripe retries don't double-charge." }, 1, 3 * MIN),
      env("s_pay", { type: "AssistantEnvelope", message: "I'll add a Redis-backed idempotency guard keyed on the Stripe event id, and a unit test.", ttftMs: 380 }, 2, 2 * MIN),
      env("s_pay", { type: "ToolCall", toolCallId: "t1", toolName: "Edit", arguments: { file_path: "src/webhook.ts" } }, 3, 2 * MIN),
      env("s_pay", { type: "ToolResult", toolUseId: "t1", content: "Updated webhook.ts (+34 -6)" }, 4, MIN),
    ],
    s_auth: [
      env("s_auth", { type: "UserEnvelope", message: "Auth redirect loops when the token refresh races. Fix it." }, 1, 6 * MIN),
      env("s_auth", { type: "AssistantEnvelope", message: "The refresh promise isn't memoized so two 401s trigger two redirects. Want me to gate it behind a single in-flight refresh?", ttftMs: 410 }, 2, 5 * MIN),
    ],
  };
}
