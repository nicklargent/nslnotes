import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";
import apiPlugin from "./vite-plugin-api";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// When WEB_MODE is set (via dev:web script), serve file API from Vite dev server
// @ts-expect-error process is a nodejs global
const isWebMode = !!process.env.WEB_MODE;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [solid(), tailwindcss(), ...(isWebMode ? [apiPlugin()] : [])],

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
