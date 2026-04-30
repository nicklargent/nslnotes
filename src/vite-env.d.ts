/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/solid" />

declare module "virtual:app-version" {
  export const APP_VERSION: string;
  export const APP_COMMIT: string;
}
