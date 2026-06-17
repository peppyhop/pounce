// Daemon bootstrap: make sure the Pounce agent host (kittylitter) is running so
// a non-technical user needs nothing else. Strategy:
//   1. If the daemon already answers `status`, do nothing.
//   2. Otherwise locate a kittylitter binary (bundled discovery, then npx).
//   3. Run `install` — registers OS autostart (launchd / systemd-user / Startup
//      folder, no admin) AND starts it — so it persists across reboots.
//   4. Fall back to `serve` (detached) if needed.
// Everything is best-effort and non-destructive: we never stop or replace a
// daemon that's already running.
import { spawn, execFile } from "node:child_process";

const PKG = "kittylitter"; // npm package that ships the daemon binary

function statusOk(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = execFile(bin, ["status"], { timeout: 8000 }, (err, stdout) => {
      // `status` prints "pid: …" when the daemon is live (it also exits 0 in
      // file-only mode, so we check the output, not just the exit code).
      resolve(!err && /pid\s*:/i.test(stdout || ""));
    });
    child.on("error", () => resolve(false));
  });
}

function run(bin: string, args: string[], detached = false): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const child = spawn(bin, args, {
        detached,
        stdio: "ignore",
        // npx needs a shell-resolvable PATH; inherit the user's environment.
        env: process.env,
      });
      child.on("error", () => resolve(false));
      if (detached) {
        child.unref();
        resolve(true); // long-running; don't wait
      } else {
        child.on("exit", (code) => resolve(code === 0));
      }
    } catch {
      resolve(false);
    }
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ensure the daemon is up. `klPath` is the bridge's resolved kittylitter path
 * (may be the bare name if not found). Returns a short status for the log.
 */
export async function ensureDaemon(klPath: string): Promise<string> {
  // 1. Already running anywhere we can see?
  if (await statusOk(klPath)) return "daemon already running";
  if (klPath !== PKG && (await statusOk(PKG))) return "daemon already running (PATH)";

  // 2. Pick a binary to drive: the discovered path if it works, else npx.
  const haveLocal = klPath !== PKG;
  const tryStart = async (bin: string, prefix: string[]) => {
    // Prefer `install` (autostart + start); fall back to detached `serve`.
    if (await run(bin, [...prefix, "install"])) {
      await delay(2500);
      if (await statusOk(haveLocal ? klPath : PKG)) return true;
    }
    return run(bin, [...prefix, "serve"], true);
  };

  if (haveLocal && (await tryStart(klPath, []))) return "started local daemon";

  // 3. No local binary (fresh machine) — fetch + run via npx.
  if (await tryStart("npx", ["-y", `${PKG}@latest`])) return "started daemon via npx";

  return "could not start daemon — is npx/node installed?";
}
