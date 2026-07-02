/**
 * Sample workspace for exploring Pounce without a paired device. NOT loaded by
 * default — only when the user taps "Explore with sample data" on the empty
 * Home screen (see the disconnected empty state in the Home tab). Connecting a
 * real device replaces this data and clears demo mode (see connectBridge).
 */
import type { AgentId, Repository, Session } from "@litter/shared";
import { connection$, setWorkspace } from "../state/stores";

type Seed = {
  repo: string;
  cwd: string;
  host: string;
  hostId: string;
  agent: AgentId;
  title: string;
  branch: string;
  activity: Session["activity"];
  needsAttention?: boolean;
  hoursAgo: number;
};

const SEEDS: Seed[] = [
  { repo: "pounce-mono", cwd: "/Users/you/Projects/pounce-mono", host: "Studio", hostId: "dev:demo-studio", agent: "claude", title: "Add idempotent retry to the webhook handler", branch: "feat/webhook-retry", activity: "running", hoursAgo: 1 },
  { repo: "pounce-mono", cwd: "/Users/you/Projects/pounce-mono", host: "Studio", hostId: "dev:demo-studio", agent: "codex", title: "Flaky auth test — needs a decision on the mock", branch: "fix/auth-test", activity: "awaiting_input", needsAttention: true, hoursAgo: 3 },
  { repo: "web-store", cwd: "/Users/you/Projects/web-store", host: "Studio", hostId: "dev:demo-studio", agent: "codex", title: "Geo filter on product search", branch: "feat/geo-filter", activity: "completed", hoursAgo: 26 },
  { repo: "web-store", cwd: "/Users/you/Projects/web-store", host: "MacBook-Air", hostId: "dev:demo-air", agent: "claude", title: "Prod bug: cart add-to fails on variants", branch: "fix/cart-variants", activity: "failed", needsAttention: true, hoursAgo: 5 },
  { repo: "marketing-site", cwd: "/Users/you/Projects/marketing-site", host: "MacBook-Air", hostId: "dev:demo-air", agent: "opencode", title: "Dark mode polish on the pricing page", branch: "feat/pricing-dark", activity: "completed", hoursAgo: 30 },
];

/** Seed the sample workspace and enter demo mode. */
export function enableDemo(): void {
  const now = Date.now();
  const iso = (h: number) => new Date(now - h * 3_600_000).toISOString();

  const sessions: Record<string, Session> = {};
  const repos: Record<string, Repository> = {};

  SEEDS.forEach((s, i) => {
    const repoId = `repo:${s.repo}`;
    const updatedAt = iso(s.hoursAgo);
    const createdAt = iso(s.hoursAgo + 48);
    const needs = s.needsAttention ?? false;
    sessions[`demo_${i}`] = {
      id: `demo_${i}`,
      repoId,
      hostId: s.hostId,
      host: s.host,
      agent: s.agent,
      title: s.title,
      branch: s.branch,
      worktree: null,
      cwd: s.cwd,
      isLive: s.activity !== "completed",
      activity: s.activity,
      needsAttention: needs,
      createdAt,
      updatedAt,
    };
    const r = repos[repoId];
    repos[repoId] = r
      ? {
          ...r,
          sessionCount: r.sessionCount + 1,
          liveCount: r.liveCount + (s.activity !== "completed" ? 1 : 0),
          attentionCount: r.attentionCount + (needs ? 1 : 0),
          lastActivityAt: updatedAt > r.lastActivityAt ? updatedAt : r.lastActivityAt,
        }
      : {
          id: repoId,
          name: s.repo,
          sessionCount: 1,
          liveCount: s.activity !== "completed" ? 1 : 0,
          attentionCount: needs ? 1 : 0,
          lastActivityAt: updatedAt,
        };
  });

  setWorkspace(repos, sessions);
  connection$.demo.set(true);
}

/** Whether the sample workspace is currently active. */
export function isDemo(): boolean {
  return connection$.demo.get();
}
