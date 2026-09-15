/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_LAB_API?: string;
  readonly VITE_EXCHANGE_API_ORIGIN?: string;
  readonly VITE_INTEGRATION_MODE?: string;
  readonly VITE_NODE_ORIGIN?: string;
  readonly VITE_HUB_ORIGIN?: string;
  readonly VITE_EXCHANGE_ORIGIN?: string;
  readonly VITE_POOL_ORIGIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
