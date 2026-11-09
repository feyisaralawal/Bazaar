/**
 * IPFS upload utilities.
 *
 * Supports two pinning backends, chosen by the VITE_IPFS_PROVIDER env var
 * (defaults to "pinata"):
 *   - "pinata"        → POST to https://api.pinata.cloud/pinning/pinFileToIPFS
 *   - "web3storage"   → POST to https://api.web3.storage/upload  (v1 API)
 *
 * Both backends require VITE_IPFS_API_KEY.
 * The public gateway used for building read-URLs is VITE_IPFS_GATEWAY.
 *
 * For agent metadata we upload a JSON object.
 * For deliverable files we upload the raw File / Blob.
 */

export const IPFS_GATEWAY =
  import.meta.env.VITE_IPFS_GATEWAY ?? 'https://ipfs.io/ipfs/';

const IPFS_API_KEY = import.meta.env.VITE_IPFS_API_KEY ?? '';
const IPFS_PROVIDER: string =
  (import.meta.env.VITE_IPFS_PROVIDER as string | undefined) ?? 'pinata';

export interface UploadProgress {
  /** 0–100, or null while the XHR / fetch is in flight without progress info */
  percent: number | null;
  status: 'idle' | 'uploading' | 'done' | 'error';
  cid?: string;
  error?: string;
}
