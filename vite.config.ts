import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import apiPlugin from "./vite-plugin-api";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// When WEB_MODE is set (via dev:web script), serve file API from Vite dev server
// @ts-expect-error process is a nodejs global
const isWebMode = !!process.env.WEB_MODE;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    solid(),
    tailwindcss(),
    ...(isWebMode ? [apiPlugin()] : []),
    VitePWA({
      // `prompt` (not `autoUpdate`) so Workbox doesn't force
      // skipWaiting + clientsClaim into the SW. Without that, the first page
      // load after a cold install wouldn't race with the SW claiming it mid-
      // fetch (which we observed as a one-off NetworkError on cold open).
      // Consequence: a new build only activates after you reload, which is
      // desired for a single-user app.
      registerType: "prompt",
      injectRegister: "auto",
      // Service worker should only go out in production builds — in dev we
      // serve through Vite and an SW only muddies reloads.
      disable: process.env["NODE_ENV"] !== "production",
      includeAssets: [
        "icons/icon-192.png",
        "icons/icon-512.png",
        "icons/apple-touch-icon.png",
        "icons/apple-touch-icon-167.png",
        "icons/apple-touch-icon-152.png",
      ],
      manifest: {
        name: "NslNotes",
        short_name: "Notes",
        description: "Local-first, plain-text knowledge tool",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#6366F1",
        theme_color: "#4338CA",
        orientation: "portrait",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Offline deep links fall back to the SPA shell.
        navigateFallback: "/index.html",
        // SSE and the whole /api/* surface stay out of the SW entirely —
        // letting Workbox touch them broke session-cookie forwarding in
        // practice. The PWA benefit we actually want is installability +
        // app-shell precache, not offline note access (which needs conflict
        // resolution the app doesn't have anyway).
        navigateFallbackDenylist: [/^\/api\//],
        // Don't claim already-open pages mid-load. The default `clientsClaim:
        // true` makes a freshly-installed SW take over the current tab while
        // fetches are in flight, which races with auth cookies and causes a
        // "NetworkError" on the very first load after a cold install. With
        // this off, the SW only controls pages opened AFTER install — the
        // first load behaves as if there's no SW, and subsequent loads get
        // the cached shell.
        clientsClaim: false,
        skipWaiting: true,
      },
    }),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: isWebMode ? 3000 : 1420,
    strictPort: true,
    host: host || false,
    open: isWebMode ? true : false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
