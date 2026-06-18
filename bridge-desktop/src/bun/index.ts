import { BrowserWindow, Tray } from "electrobun/bun";
// The bridge lives in the repo; the desktop app just runs it in-process and
// renders the pairing QR. quiet:true suppresses the CLI console output.
// @ts-expect-error — plain .mjs, no types
import { startBridge, kittylitterPath } from "../../server/server.mjs";
import { ensureDaemon } from "./daemon";

const PORT = Number(process.env.BRIDGE_PORT || 8099);

// Bootstrap the agent host in the background so the user needs nothing else.
// The window shows "Starting your agent host…" until the daemon answers.
void ensureDaemon(kittylitterPath() as string)
  .then((msg) => console.log(`[daemon] ${msg}`))
  .catch((e) => console.error("[daemon] bootstrap failed:", e));

const info = await startBridge({ port: PORT, quiet: true });
if (info?.error && !info.alreadyRunning) {
  console.error("Pounce Bridge could not start:", info.error);
} else if (info?.alreadyRunning) {
  console.log(`A Pounce Bridge is already running on ${PORT}; showing its status.`);
}

let win: BrowserWindow | null = null;
function openWindow() {
  // Load the UI straight from the bridge so /ui and /qr.svg are same-origin and
  // the port is implicit. The server is already listening (awaited above).
  win = new BrowserWindow({
    title: "Pounce Bridge",
    url: `http://127.0.0.1:${PORT}/`,
    frame: { width: 460, height: 640, x: 240, y: 120 },
  });
}
openWindow();

// Set the image in the constructor so the `template` flag is honored — macOS
// then renders the paw adaptively (white on a dark menu bar, dark on a light
// one). Calling setImage() afterward would drop the template flag.
const tray = new Tray({ title: "", image: "views://tray.png", template: true, width: 18, height: 18 });

// Rebuild the menu with a live, non-clickable status line at the top.
function renderMenu(statusLabel: string) {
  tray.setMenu([
    { type: "normal", label: statusLabel, enabled: false },
    { type: "divider" },
    { type: "normal", label: "Show pairing window", action: "show" },
    { type: "divider" },
    { type: "normal", label: "Quit Pounce Bridge", action: "quit" },
  ]);
}
renderMenu("○ Ready to pair");

tray.on("tray-clicked", (event: any) => {
  switch (event.data?.action) {
    case "show":
      openWindow();
      break;
    case "quit":
      tray.remove();
      process.exit(0);
      break;
  }
});

// Poll the bridge's own status and reflect connection state in the tray. Only
// re-render the menu when the label actually changes, so we don't thrash it.
let lastLabel = "";
async function pollStatus() {
  let label = "○ Ready to pair";
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/ui`, { signal: AbortSignal.timeout(2500) });
    const d: any = await r.json();
    if (d.connected) {
      const n = d.devices && d.devices > 0 ? d.devices : 1;
      label = `● Connected · ${n} device${n === 1 ? "" : "s"}`;
    } else if (!d.daemonOk) {
      label = "◌ Starting agent host…";
    }
  } catch {
    label = "◌ Starting…";
  }
  if (label !== lastLabel) {
    lastLabel = label;
    renderMenu(label);
    tray.setTitle(label.startsWith("●") ? "●" : ""); // a green-ish dot in the menu bar when connected
  }
}
void pollStatus();
setInterval(() => void pollStatus(), 3000);

console.log("Pounce Bridge is running. Scan the QR in the window to connect your phone.");
