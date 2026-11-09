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

// ── helpers ────────────────────────────────────────────────────────────────────

/** Convert an IPFS URI (ipfs://Qm…) to a gateway HTTP URL. */
export function ipfsUriToUrl(uri: string): string {
  if (uri.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}${uri.slice(7)}`;
  }
  // Already an HTTP URL – return as-is.
  return uri;
}

/** True when the app has an API key configured. */
export function isIpfsConfigured(): boolean {
  return IPFS_API_KEY.length > 0;
}

/** Format a CID as a full IPFS URI: "ipfs://<cid>" */
export function cidToUri(cid: string): string {
  return `ipfs://${cid}`;
}

// ── upload implementations ─────────────────────────────────────────────────────

async function uploadViaPinata(file: File | Blob, filename: string): Promise<string> {
  const form = new FormData();
  form.append('file', file, filename);
  form.append(
    'pinataMetadata',
    JSON.stringify({ name: filename }),
  );
  form.append(
    'pinataOptions',
    JSON.stringify({ cidVersion: 1 }),
  );

  const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IPFS_API_KEY}`,
    },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Pinata upload failed (${res.status}): ${body}`);
  }

  const json = await res.json() as { IpfsHash: string };
  return json.IpfsHash;
}

async function uploadViaWeb3Storage(file: File | Blob, filename: string): Promise<string> {
  const res = await fetch('https://api.web3.storage/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${IPFS_API_KEY}`,
      'X-Name': filename,
    },
    body: file,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`web3.storage upload failed (${res.status}): ${body}`);
  }

  const json = await res.json() as { cid: string };
  return json.cid;
}
