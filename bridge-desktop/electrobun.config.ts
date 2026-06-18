import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Pounce Bridge",
    identifier: "app.pounce.bridge",
    version: "1.0.1",
  },
  runtime: {
    // It's a tray app — closing the window leaves it running in the menu bar.
    exitOnLastWindowClosed: false,
  },
  build: {
    bun: { entrypoint: "src/bun/index.ts" },
    views: {
      mainview: { entrypoint: "src/mainview/index.ts" },
    },
    copy: {
      "src/mainview/index.html": "views/mainview/index.html",
      "src/mainview/index.css": "views/mainview/index.css",
      "assets/tray.png": "views/tray.png",
    },
    mac: {
      bundleCEF: false,
      icons: "assets/icon.iconset",
      // Sign when a Developer ID is present; only let Electrobun notarize when
      // notarization creds are also present. (release-bridge.sh signs here and
      // notarizes separately via the `asc` CLI's stored credentials.)
      codesign: !!process.env.ELECTROBUN_DEVELOPER_ID,
      notarize: !!(process.env.ELECTROBUN_APPLEID || process.env.ELECTROBUN_APPLEAPIKEY),
    },
    linux: { bundleCEF: false },
    win: { bundleCEF: false },
  },
} satisfies ElectrobunConfig;
