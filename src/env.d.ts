/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly DATABASE_URL?: string;
  readonly PGSSL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
