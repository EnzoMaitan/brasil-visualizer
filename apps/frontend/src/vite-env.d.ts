/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the NestJS backend API. Defaults to http://localhost:3000 if unset. */
  readonly VITE_API_URL?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
