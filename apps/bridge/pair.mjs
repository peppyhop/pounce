// Print the Pounce pairing QR on demand. Scan it with the iPhone Camera to
// open Pounce and add this machine. Run: `bun run bridge:qr` from the repo root.
import os from "node:os";
import qrcode from "qrcode-terminal";

const PORT = Number(process.env.BRIDGE_PORT || 8099);
const TOKEN = process.env.BRIDGE_TOKEN || "pounce-bridge-local";
const ip =
  Object.values(os.networkInterfaces())
    .flat()
    .find((i) => i?.family === "IPv4" && !i.internal)?.address || "localhost";

const url = `http://${ip}:${PORT}`;
const deepLink = `pounce://connect?url=${encodeURIComponent(url)}&token=${encodeURIComponent(TOKEN)}`;

console.log(`\n📲 Pair Pounce — scan with your iPhone Camera:\n`);
qrcode.generate(deepLink, { small: true });
console.log(`\n…or open on the device:\n${deepLink}\n`);
