/**
 * Typed client for the AI Agent Marketplace Soroban contract.
 *
 * Wraps `StellarContext.invokeContract` (a raw `Contract.call` + simulate)
 * with typed, camelCase methods that build the ScVal arguments and decode the
 * returned ScVal into the plain TypeScript types from `./types`.
 *
 * Decoding notes
 * --------------
 * `scValToNative` recursively converts an ScVal tree to native JS values:
 *   - structs (ScvMap)  -> plain object keyed by the Rust field name (snake_case)
 *   - Vec<T>            -> JS array
 *   - Option<T>         -> `null` (None) or the value / a 1-element array (Some)
 *   - u32               -> number
 *   - u64 / i128        -> bigint
 *   - Address           -> string (G.../C...)
 *   - Map<K, V>          -> plain object (or JS Map, handled either way)
 *
 * Unit enums (e.g. `JobStatus`) and `Result<T, E>` are encoded as a Vec whose
 * first element is the variant discriminant (u32) and second is the variant
 * name (Symbol). We therefore normalise:
 *   - unit enum  -> `[u32, "Open"]`        -> "Open"
 *   - Result Ok -> `[u32, "Ok",  payload]` -> payload
 *   - Result Err -> `[u32, "Err", error]`   -> throws
 *
 * The mappers below are defensive so they keep working regardless of minor
 * differences in how the SDK exposes Option / enum values.
 */

import { nativeToScVal, scValToNative, xdr } from '@stellar/stellar-sdk';
import type {
  Agent,
  Bid,
  Escrow,
  Job,
  PlatformStats,
  Review,
} from './types';

export type InvokeFn = (
  method: string,
  ...args: xdr.ScVal[]
) => Promise<xdr.ScVal | null>;

/** Signs a transaction XDR (e.g. via Freighter) and returns the signed XDR. */
export type SignFn = (xdr: string) => Promise<string>;

/** Builds, signs and submits a real transaction invoking `method`. */
export type SendFn = (
  method: string,
  args: xdr.ScVal[],
  publicKey: string,
  signTransaction: SignFn,
) => Promise<xdr.ScVal | null>;

// ── argument builders ────────────────────────────────────────────────────────
const u64 = (n: number | bigint): xdr.ScVal =>
  nativeToScVal(BigInt(n), { type: 'u64' });
const i128 = (n: number | bigint | string): xdr.ScVal =>
  nativeToScVal(BigInt(n), { type: 'i128' });
const addr = (a: string): xdr.ScVal => nativeToScVal(a, { type: 'address' });
const str = (s: string): xdr.ScVal => nativeToScVal(s, { type: 'string' });
const strVec = (arr: string[]): xdr.ScVal => nativeToScVal(arr, { type: 'vec<string>' });
const bytes32 = (b: Uint8Array): xdr.ScVal => nativeToScVal(b, { type: 'bytes' });

// ── low-level decoding helpers ───────────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-explicit-any */
type Native = any;

function toNum(v: Native): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && v !== '') return Number(v);
  return 0;
}

function toStr(v: Native): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function toBool(v: Native): boolean {
  return Boolean(v);
}

function toStringArray(v: Native): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => toStr(x));
}

function toBoolRecord(v: Native): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (v instanceof Map) {
    for (const [k, val] of (v as Map<Native, Native>).entries()) {
      out[String(k)] = toBool(val);
    }
    return out;
  }
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v)) {
      out[String(k)] = toBool(val);
    }
  }
  return out;
}

function toIdArray(v: Native): number[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => toNum(x));
}

function toHex(v: Native): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(v))) {
    const bytes = Array.from(v as Uint8Array);
    return '0x' + bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  return String(v);
}

/**
 * Decode an `Option<T>` value. Handles None (null / undefined / empty array)
 * and Some (the value directly, or a 1-element array wrapping it).
 */
function optionVal<T>(v: Native, mapFn: (x: Native) => T): T | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    if (v.length === 1) return mapFn(v[0]);
    // Unexpected shape for an Option; treat the whole thing as the value.
    return mapFn(v);
  }
  return mapFn(v);
}

/**
 * Decode a unit enum variant. Unit enums serialise as `[u32, Symbol("Name")]`.
 * If the SDK already returns a string we use it directly; if only a numeric
 * discriminant is present we fall back to "" (callers default to a safe label).
 */
function enumVal(v: Native): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) {
    for (const el of v) {
      if (typeof el === 'string') return el;
    }
  }
  return '';
}

/**
 * Unwrap a `Result<T, E>`. Returns the Ok payload, or throws for Err.
 * Only applies to the top-level return of the Result-returning getters.
 */
function unwrapResult(v: Native): Native {
  if (Array.isArray(v) && v.length >= 3) {
    const tag = v[1];
    if (tag === 'Ok') return v[2];
    if (tag === 'Err') {
      const err = v[2];
      const name = enumVal(err) || 'UnknownError';
      throw new Error(`Contract error: ${name}`);
    }
  }
  return v;
}

// ── struct mappers ────────────────────────────────────────────────────────────
function mapAgent(raw: Native): Agent {
  return {
    id: toNum(raw.id),
    owner: toStr(raw.owner),
    name: toStr(raw.name),
    description: toStr(raw.description),
    skills: toStringArray(raw.skills),
    pricePerTask: toNum(raw.price_per_task),
    reputation: toNum(raw.reputation),
    totalJobsCompleted: toNum(raw.total_jobs_completed),
    totalEarnings: toNum(raw.total_earnings),
    isActive: toBool(raw.is_active),
    createdAt: toNum(raw.created_at),
    skillsVerified: toBoolRecord(raw.skills_verified),
    metadataUri: toStr(raw.metadata_uri),
  };
}

function mapBid(raw: Native): Bid {
  return {
    id: toNum(raw.id),
    agent: toStr(raw.agent),
    agentId: toNum(raw.agent_id),
    amount: toNum(raw.amount),
    proposedTimeline: toNum(raw.proposed_timeline),
    proposal: toStr(raw.proposal),
    submittedAt: toNum(raw.submitted_at),
    status: (enumVal(raw.status) as Bid['status']) || 'Pending',
  };
}

function mapJob(raw: Native): Job {
  return {
    id: toNum(raw.id),
    client: toStr(raw.client),
    title: toStr(raw.title),
    description: toStr(raw.description),
    requiredSkills: toStringArray(raw.required_skills),
    budget: toNum(raw.budget),
    deadline: toNum(raw.deadline),
    status: (enumVal(raw.status) as Job['status']) || 'Open',
    assignedAgent: optionVal<string>(raw.assigned_agent, toStr),
    bids: Array.isArray(raw.bids) ? (raw.bids as Native[]).map(mapBid) : [],
    escrowAmount: toNum(raw.escrow_amount),
    escrowCreatedAt: null, // set separately from the linked Escrow if fetched
    createdAt: toNum(raw.created_at),
    completedAt: optionVal<number>(raw.completed_at, toNum),
    deliverableHash: optionVal<string>(raw.deliverable_hash, toHex),
    disputeRaised: toBool(raw.dispute_raised),
  };
}

function mapReview(raw: Native): Review {
  return {
    id: toNum(raw.id),
    jobId: toNum(raw.job_id),
    reviewer: toStr(raw.reviewer),
    reviewee: toStr(raw.reviewee),
    rating: toNum(raw.rating),
    comment: toStr(raw.comment),
    createdAt: toNum(raw.created_at),
  };
}

function mapPlatformStats(raw: Native): PlatformStats {
  return {
    totalAgents: toNum(raw.total_agents),
    totalJobs: toNum(raw.total_jobs),
    totalVolume: toNum(raw.total_volume),
    totalFeesCollected: toNum(raw.total_fees_collected),
    totalDisputes: toNum(raw.total_disputes),
    avgJobCompletionTime: toNum(raw.avg_job_completion_time),
  };
}

function mapEscrow(raw: Native): Escrow {
  return {
    jobId: toNum(raw.job_id),
    client: toStr(raw.client),
    agent: toStr(raw.agent),
    amount: toNum(raw.amount),
    token: toStr(raw.token),
    status: (enumVal(raw.status) as Escrow['status']) || 'Funded',
    createdAt: toNum(raw.created_at),
    releasedAt: optionVal<number>(raw.released_at, toNum),
    disputeRaisedAt: optionVal<number>(raw.dispute_raised_at, toNum),
    resolver: optionVal<string>(raw.resolver, toStr),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── client ─────────────────────────────────────────────────────────────────────
export class MarketplaceClient {
  constructor(
    private invokeContract: InvokeFn,
    private sendTx?: SendFn,
  ) {}

  /** Invoke a read method and return its `scValToNative` result. */
  private async call(method: string, ...args: xdr.ScVal[]): Promise<Native> {
    const raw = await this.invokeContract(method, ...args);
    if (raw === null || raw === undefined) return null;
    return scValToNative(raw);
  }

  /** Sign and submit a mutating call, returning its `scValToNative` result. */
  private async send(
    method: string,
    publicKey: string,
    signTransaction: SignFn,
    ...args: xdr.ScVal[]
  ): Promise<Native> {
    if (!this.sendTx) throw new Error('Write transactions are not available.');
    const raw = await this.sendTx(method, args, publicKey, signTransaction);
    if (raw === null || raw === undefined) return null;
    return scValToNative(raw);
  }

  // ── mutations (real signed Soroban transactions) ──────────────────────────
  async registerAgent(
    publicKey: string,
    signTransaction: SignFn,
    params: { name: string; description: string; skills: string[]; pricePerTask: number | bigint; metadataUri: string },
  ): Promise<number> {
    const raw = await this.send(
      'register_agent', publicKey, signTransaction,
      addr(publicKey),
      str(params.name),
      str(params.description),
      strVec(params.skills),
      i128(params.pricePerTask),
      str(params.metadataUri),
    );
    return toNum(unwrapResult(raw));
  }

  async postJob(
    publicKey: string,
    signTransaction: SignFn,
    params: { title: string; description: string; requiredSkills: string[]; budget: number | bigint; deadlineDays: number },
  ): Promise<number> {
    const raw = await this.send(
      'post_job', publicKey, signTransaction,
      addr(publicKey),
      str(params.title),
      str(params.description),
      strVec(params.requiredSkills),
      i128(params.budget),
      u64(params.deadlineDays),
    );
    return toNum(unwrapResult(raw));
  }

  async placeBid(
    publicKey: string,
    signTransaction: SignFn,
    params: { jobId: number; amount: number | bigint; proposedTimelineDays: number; proposal: string },
  ): Promise<number> {
    const raw = await this.send(
      'place_bid', publicKey, signTransaction,
      addr(publicKey),
      u64(params.jobId),
      i128(params.amount),
      u64(params.proposedTimelineDays),
      str(params.proposal),
    );
    return toNum(unwrapResult(raw));
  }

  async acceptBid(publicKey: string, signTransaction: SignFn, jobId: number, bidId: number): Promise<void> {
    const raw = await this.send(
      'accept_bid', publicKey, signTransaction, addr(publicKey), u64(jobId), u64(bidId),
    );
    unwrapResult(raw);
  }

  async submitDeliverable(
    publicKey: string,
    signTransaction: SignFn,
    jobId: number,
    deliverableHash: Uint8Array,
  ): Promise<void> {
    const raw = await this.send(
      'submit_deliverable', publicKey, signTransaction,
      addr(publicKey), u64(jobId), bytes32(deliverableHash),
    );
    unwrapResult(raw);
  }

  async approveDeliverable(publicKey: string, signTransaction: SignFn, jobId: number): Promise<void> {
    const raw = await this.send(
      'approve_deliverable', publicKey, signTransaction, addr(publicKey), u64(jobId),
    );
    unwrapResult(raw);
  }

  async reclaimExpiredEscrow(publicKey: string, signTransaction: SignFn, jobId: number): Promise<void> {
    const raw = await this.send(
      'reclaim_expired_escrow', publicKey, signTransaction, addr(publicKey), u64(jobId),
    );
    unwrapResult(raw);
  }

  // ── single-record getters (Result<T, Error>) ──────────────────────────────
  async getAgent(agentId: number): Promise<Agent> {
    return mapAgent(unwrapResult(await this.call('get_agent', u64(agentId))));
  }

  async getJob(jobId: number): Promise<Job> {
    return mapJob(unwrapResult(await this.call('get_job', u64(jobId))));
  }

  async getBid(bidId: number): Promise<Bid> {
    return mapBid(unwrapResult(await this.call('get_bid', u64(bidId))));
  }

  async getReview(reviewId: number): Promise<Review> {
    return mapReview(unwrapResult(await this.call('get_review', u64(reviewId))));
  }

  // ── owner / job lookups (Option<T>) ────────────────────────────────────────
  async getAgentByOwner(owner: string): Promise<Agent | null> {
    const opt = optionVal(await this.call('get_agent_by_owner', addr(owner)), (x) => x);
    return opt ? mapAgent(opt) : null;
  }

  async getEscrowByJob(jobId: number): Promise<Escrow | null> {
    const opt = optionVal(await this.call('get_escrow_by_job', u64(jobId)), (x) => x);
    return opt ? mapEscrow(opt) : null;
  }

  // ── bulk listings (Vec<T>) ─────────────────────────────────────────────────
  async getAllAgents(offset: number, limit: number): Promise<Agent[]> {
    const v = await this.call('get_all_agents', u64(offset), u64(limit));
    return Array.isArray(v) ? (v as Native[]).map(mapAgent) : [];
  }

  async getAllJobs(offset: number, limit: number): Promise<Job[]> {
    const v = await this.call('get_all_jobs', u64(offset), u64(limit));
    return Array.isArray(v) ? (v as Native[]).map(mapJob) : [];
  }

  // ── paginated id indexes (Vec<u64>) ────────────────────────────────────────
  async getJobsByClient(client: string, offset: number, limit: number): Promise<number[]> {
    return toIdArray(await this.call('get_jobs_by_client', addr(client), u64(offset), u64(limit)));
  }

  async getJobsByAgent(agent: string, offset: number, limit: number): Promise<number[]> {
    return toIdArray(await this.call('get_jobs_by_agent', addr(agent), u64(offset), u64(limit)));
  }

  async getBidsByJob(jobId: number, offset: number, limit: number): Promise<number[]> {
    return toIdArray(await this.call('get_bids_by_job', u64(jobId), u64(offset), u64(limit)));
  }

  async getBidsByAgent(agent: string, offset: number, limit: number): Promise<number[]> {
    return toIdArray(await this.call('get_bids_by_agent', addr(agent), u64(offset), u64(limit)));
  }

  async getReviewsByReviewee(reviewee: string, offset: number, limit: number): Promise<number[]> {
    return toIdArray(
      await this.call('get_reviews_by_reviewee', addr(reviewee), u64(offset), u64(limit)),
    );
  }

  async getAgentsBySkill(skill: string, offset: number, limit: number): Promise<number[]> {
    return toIdArray(await this.call('get_agents_by_skill', str(skill), u64(offset), u64(limit)));
  }

  // ── stats ──────────────────────────────────────────────────────────────────
  async getPlatformStats(): Promise<PlatformStats> {
    return mapPlatformStats(await this.call('get_platform_stats'));
  }

  // ── convenience: resolve ids -> full records ────────────────────────────────
  async getJobsByIds(ids: number[]): Promise<Job[]> {
    return Promise.all(ids.map((id) => this.getJob(id)));
  }

  async getBidsByIds(ids: number[]): Promise<Bid[]> {
    return Promise.all(ids.map((id) => this.getBid(id)));
  }

  async getReviewsByIds(ids: number[]): Promise<Review[]> {
    return Promise.all(ids.map((id) => this.getReview(id)));
  }
}

/** Human-readable label for a JobStatus fallback (when decoding yields ""). */
export const JOB_STATUS_LABELS: Record<string, string> = {
  Open: 'Open',
  InProgress: 'In Progress',
  Completed: 'Completed',
  Disputed: 'Disputed',
  Cancelled: 'Cancelled',
  Refunded: 'Refunded',
};
