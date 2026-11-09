/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IPFS_GATEWAY?: string;
  readonly VITE_IPFS_API_KEY?: string;
  readonly VITE_IPFS_PROVIDER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
