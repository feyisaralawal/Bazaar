import React, { useRef, useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useInfiniteQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  DollarSign, Clock, User, CheckCircle, AlertCircle,
  ArrowLeft, Send, Wallet, Loader2, ExternalLink,
  Shield, FileText, XCircle, RefreshCw,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useStellar } from '@/contexts/StellarContext';
import type { Bid, Job, Review } from '@/lib/types';
import { QueryError } from '@/components/ui/QueryError';
import { formatPrice, getSkillColor } from '@/pages/Marketplace';
import { clsx } from 'clsx';
import { format } from 'date-fns/format';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import {
  uploadToIpfs,
  sha256OfFile,
  cidToUri,
  ipfsUriToUrl,
  isIpfsConfigured,
  type UploadProgress,
} from '@/lib/ipfs';
import { isAddressBlocked } from '@/lib/compliance';
import { notify } from '@/lib/notify';

/**
 * Number of days after escrow creation beyond which the client may reclaim
 * funds.  Must match the `escrow_expiry_days` value configured at contract
 * initialisation time.
 */
const ESCROW_EXPIRY_DAYS = 30;

/**
 * Page size used when paginating the bids index for a job.
 */
const BIDS_PAGE_SIZE = 20;

// ── JobDetail component ────────────────────────────────────────────────────────
export const JobDetail: React.FC = () => {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { publicKey, isConnected, signTransaction } = useWallet();
  const { getContractClient } = useStellar();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'details' | 'bids' | 'activity'>('details');
  const [showBidModal, setShowBidModal] = useState(false);
  const [bidAmount, setBidAmount] = useState('');
  const [bidTimeline, setBidTimeline] = useState('');
  const [bidProposal, setBidProposal] = useState('');
  const [showDeliverableModal, setShowDeliverableModal] = useState(false);
  const [deliverableNote, setDeliverableNote] = useState('');

  // Review form state
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);

  // IPFS deliverable upload state
  const [deliverableFile, setDeliverableFile] = useState<File | null>(null);
  const [deliverableIpfsCid, setDeliverableIpfsCid] = useState<string | null>(null);
  const [deliverableUploadProgress, setDeliverableUploadProgress] = useState<UploadProgress>({
    percent: null,
    status: 'idle',
  });
  // CID of the last successfully submitted deliverable (shown in the job detail)
  const [submittedDeliverableCid, setSubmittedDeliverableCid] = useState<string | null>(null);
  const deliverableFileRef = useRef<HTMLInputElement>(null);
  const loadMoreBidsRef = useRef<HTMLDivElement>(null);

  const jobIdNum = parseInt(jobId || '0');

  // ── job query ──────────────────────────────────────────────────────────────
  const {
    data: job,
    isLoading,
    error,
    refetch: refetchJob,
  } = useQuery<Job>({
    queryKey: ['job', jobIdNum],
    queryFn: async () => {
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      const j = await client.getJob(jobIdNum);
      // Enrich with escrow createdAt if an escrow exists for this job
      try {
        const escrow = await client.getEscrowByJob(jobIdNum);
        if (escrow) j.escrowCreatedAt = escrow.createdAt;
      } catch {
        // non-fatal — escrowCreatedAt stays null
      }
      return j;
    },
    enabled: !!jobIdNum,
  });

  // ── bids query (paginated via the index) ───────────────────────────────────
  const {
    data: bidsPages,
    error: bidsError,
    refetch: refetchBids,
    fetchNextPage: fetchNextBidsPage,
    hasNextPage: hasNextBidsPage,
    isFetchingNextPage: isFetchingNextBidsPage,
  } = useInfiniteQuery<Bid[], Error>({
    queryKey: ['job-bids', jobIdNum],
    queryFn: async ({ pageParam = 0 }) => {
      const client = getContractClient();
      if (!client) return [];
      const offset = pageParam as number;
      const ids = await client.getBidsByJob(jobIdNum, offset, BIDS_PAGE_SIZE);
      return Promise.all(ids.map((id) => client.getBid(id)));
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (lastPage.length !== BIDS_PAGE_SIZE) return undefined;
      return allPages.reduce((acc, page) => acc + page.length, 0);
    },
    enabled: !!jobIdNum,
  });

  const bids: Bid[] = bidsPages?.pages.flat() ?? [];

  // ── reviews query ──────────────────────────────────────────────────────────
  const { data: reviews = [], refetch: refetchReviews } = useQuery<Review[]>({
    queryKey: ['job-reviews', jobIdNum],
    queryFn: async () => {
      const client = getContractClient();
      if (!client) return [];
      return client.getReviewsByJob(jobIdNum);
    },
    enabled: !!jobIdNum,
  });

  // ── infinite-scroll sentinel for the bids list ─────────────────────────────
  useEffect(() => {
    const sentinel = loadMoreBidsRef.current;
    if (!sentinel) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (
          entry?.isIntersecting &&
          hasNextBidsPage &&
          !isFetchingNextBidsPage
        ) {
          void fetchNextBidsPage();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextBidsPage, isFetchingNextBidsPage, fetchNextBidsPage]);

  // ── derived state ──────────────────────────────────────────────────────────
  const isClient = publicKey === job?.client;
  const isAssignedAgent = publicKey === job?.assignedAgent;
  const isParticipant = isClient || isAssignedAgent;
  const hasReviewed = !!publicKey && reviews.some((r) => r.reviewer === publicKey);
  const canReview =
    isConnected &&
    isParticipant &&
    job?.status === 'Completed' &&
    !hasReviewed;
  const canBid =
    isConnected &&
    !isClient &&
    job?.status === 'Open' &&
    !isAssignedAgent &&
    !isBlocked &&
    !isBlocklistLoading;

  // ── action handlers (sign + submit real Soroban transactions) ─────────────
  const handleBid = async () => {
    if (!publicKey) return;
    const client = getContractClient();
    if (!client) {
      notify.error('Not connected to the marketplace contract. Configure it in Settings.');
      return;
    }
    // Compliance: re-check the blocklist right before submitting so a stale
    // cache cannot let a blocked address post a bid.
    try {
      if (await isAddressBlocked(publicKey, client)) {
        notify.error(
          'Compliance error: your wallet address is blocked from participating in this marketplace. ' +
            'Bidding is not permitted. Contact support if you believe this is a mistake.',
        );
        await queryClient.invalidateQueries({ queryKey: ['compliance-blocked', publicKey] });
        return;
      }
    } catch (err) {
      console.error('Compliance check failed:', err);
      notify.error('Unable to verify compliance status. Please try again later.');
      return;
    }
    setIsActing(true);
    try {
      await client.placeBid(publicKey, signTransaction, {
        jobId: jobIdNum,
        amount: Math.round(parseFloat(bidAmount) * 10000000),
        proposedTimelineDays: parseInt(bidTimeline, 10),
        proposal: bidProposal,
      });
      setShowBidModal(false);
      setBidAmount('');
      setBidTimeline('');
      setBidProposal('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] }),
        queryClient.invalidateQueries({ queryKey: ['job-bids', jobIdNum] }),
      ]);
      notify.success('Bid placed successfully!', undefined, 'bidUpdates');
    } catch (err) {
      console.error('Bid failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to place bid. Please try again.');
    } finally {
      setIsActing(false);
    }
  };

  const handleAcceptBid = async (bidId: number) => {
    if (!publicKey || !isClient) return;
    const client = getContractClient();
    if (!client) {
      alert('Not connected to the marketplace contract. Configure it in Settings.');
      return;
    }
    setIsActing(true);
    try {
      await client.acceptBid(publicKey, signTransaction, jobIdNum, bidId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] }),
        queryClient.invalidateQueries({ queryKey: ['job-bids', jobIdNum] }),
      ]);
      alert(`Bid ${bidId} accepted! Escrow funded.`);
    } catch (err) {
      console.error('Accept bid failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to accept bid. Please try again.');
    } finally {
      setIsActing(false);
    }
  };

  const handleSubmitDeliverable = async () => {
    if (!publicKey || !isAssignedAgent) return;
    const client = getContractClient();
    if (!client) {
      alert('Not connected to the marketplace contract. Configure it in Settings.');
      return;
    }

    // At least one of file or note must be provided.
    if (!deliverableFile && !deliverableNote.trim()) {
      alert('Please upload a deliverable file or enter a description/link.');
      return;
    }

    setIsActing(true);
    try {
      let fileHashBytes: Uint8Array;
      let ipfsCid: string | null = deliverableIpfsCid;

      if (deliverableFile) {
        // If the file hasn't been uploaded to IPFS yet, do it now.
        if (!ipfsCid) {
          if (!isIpfsConfigured()) {
            // Fall back to hashing the file bytes without IPFS when no key is set.
            fileHashBytes = await sha256OfFile(deliverableFile);
          } else {
            setDeliverableUploadProgress({ percent: null, status: 'uploading' });
            ipfsCid = await uploadToIpfs(
              deliverableFile,
              deliverableFile.name,
              setDeliverableUploadProgress,
            );
            setDeliverableIpfsCid(ipfsCid);
          }
        }

        if (ipfsCid) {
          // Hash the CID string so the on-chain bytes32 is deterministic and
          // can be verified later: sha256(cidToUri(cid)).
          const encoded = new TextEncoder().encode(cidToUri(ipfsCid));
          const digest = await crypto.subtle.digest('SHA-256', encoded);
          fileHashBytes = new Uint8Array(digest);
        } else {
          // IPFS not configured — hash raw file bytes as fallback.
          fileHashBytes = await sha256OfFile(deliverableFile);
        }
      } else {
        // Text-only fallback: hash the note text (legacy behaviour).
        const digest = await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(deliverableNote),
        );
        fileHashBytes = new Uint8Array(digest);
      }

      await client.submitDeliverable(publicKey, signTransaction, jobIdNum, fileHashBytes);

      // Persist CID so the UI can display the IPFS link after modal close.
      if (ipfsCid) setSubmittedDeliverableCid(ipfsCid);

      setShowDeliverableModal(false);
      setDeliverableNote('');
      setDeliverableFile(null);
      setDeliverableIpfsCid(null);
      setDeliverableUploadProgress({ percent: null, status: 'idle' });
      if (deliverableFileRef.current) deliverableFileRef.current.value = '';

      await queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] });
      alert('Deliverable submitted!');
    } catch (err) {
      console.error('Submit failed:', err);
      setDeliverableUploadProgress({ percent: null, status: 'error', error: String(err) });
      alert(err instanceof Error ? err.message : 'Failed to submit deliverable.');
    } finally {
      setIsActing(false);
    }
  };

  const handleApprove = async () => {
    if (!publicKey || !isClient) return;
    const client = getContractClient();
    if (!client) {
      alert('Not connected to the marketplace contract. Configure it in Settings.');
      return;
    }
    setIsActing(true);
    try {
      await client.approveDeliverable(publicKey, signTransaction, jobIdNum);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] }),
        queryClient.invalidateQueries({ queryKey: ['job-bids', jobIdNum] }),
      ]);
      alert('Deliverable approved! Payment released.');
    } catch (err) {
      console.error('Approve failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to approve deliverable.');
    } finally {
      setIsActing(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!publicKey || !isParticipant) return;
    if (reviewRating < 1 || reviewRating > 5) {
      alert('Please select a rating between 1 and 5 stars.');
      return;
    }
    const client = getContractClient();
    if (!client) {
      alert('Not connected to the marketplace contract. Configure it in Settings.');
      return;
    }
    setIsSubmittingReview(true);
    try {
      await client.leaveReview(publicKey, signTransaction, {
        jobId: jobIdNum,
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setReviewRating(0);
      setReviewComment('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['job-reviews', jobIdNum] }),
        queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] }),
      ]);
      alert('Review submitted. Thank you!');
    } catch (err) {
      console.error('Review failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to submit review. Please try again.');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleReclaimFunds = async () => {
    if (!publicKey || !isClient) return;
    const client = getContractClient();
    if (!client) {
      alert('Not connected to the marketplace contract. Configure it in Settings.');
      return;
    }
    setIsActing(true);
    try {
      await client.reclaimExpiredEscrow(publicKey, signTransaction, jobIdNum);
      await queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] });
      alert('Funds reclaimed successfully!');
    } catch (err) {
      console.error('Reclaim failed:', err);
      alert(err instanceof Error ? err.message : 'Failed to reclaim funds. Please try again.');
    } finally {
      setIsActing(false);
    }
  };

  // ── loading / error ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        {error ? (
          <div className="max-w-md w-full">
            <QueryError
              message={(error as Error)?.message}
              onRetry={() => refetchJob()}
            />
          </div>
        ) : (
          <Card className="max-w-md w-full">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Job Not Found</h2>
              <p className="text-muted-foreground mb-4">This job doesn't exist or has been removed.</p>
              <Button onClick={() => navigate('/marketplace')}>Browse Jobs</Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  // ── escrow / deadline calculations ─────────────────────────────────────────
  const timeLeft = job.deadline * 1000 - Date.now();
  const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
  const isExpired = timeLeft <= 0;

  const escrowExpiryTime = job.escrowCreatedAt
    ? (job.escrowCreatedAt + ESCROW_EXPIRY_DAYS * 86400) * 1000
    : null;
  const isEscrowExpired = escrowExpiryTime !== null && Date.now() > escrowExpiryTime;
  const canReclaimFunds =
    isClient &&
    job.status === 'InProgress' &&
    isEscrowExpired &&
    job.escrowAmount > 0;

  const statusConfig = {
    Open:       { label: 'Open for Bids',   color: 'success'     as const, icon: DollarSign },
    InProgress: { label: 'In Progress',     color: 'default'     as const, icon: Clock },
    Completed:  { label: 'Completed',       color: 'success'     as const, icon: CheckCircle },
    Disputed:   { label: 'Disputed',        color: 'destructive' as const, icon: AlertCircle },
    Cancelled:  { label: 'Cancelled',       color: 'secondary'   as const, icon: XCircle },
    Refunded:   { label: 'Refunded',        color: 'secondary'   as const, icon: XCircle },
  } as const;

  const currentStatus = statusConfig[job.status] ?? statusConfig.Open;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link
              to="/marketplace"
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Marketplace</span>
            </Link>
            {isClient && (
              <Link to="/dashboard" className="btn-secondary flex items-center gap-2 text-sm">
                <Wallet className="h-4 w-4" />
                My Dashboard
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Job Header ── */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-3">
                <Badge variant={currentStatus.color}>{currentStatus.label}</Badge>
                {job.disputeRaised && (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" /> Dispute Raised
                  </Badge>
                )}
                <span className="text-sm text-muted-foreground">
                  Posted {formatDistanceToNow(new Date(job.createdAt * 1000), { addSuffix: true })}
                </span>
              </div>
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-3">{job.title}</h1>
              <p className="text-lg text-muted-foreground max-w-3xl">{job.description}</p>
            </div>

            {/* Budget & Deadline Card */}
            <Card
              className="w-full sm:w-72 flex-shrink-0"
              style={{ borderColor: isExpired ? 'hsl(var(--destructive))' : undefined }}
            >
              <CardContent className="p-5 space-y-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Budget</p>
                  <p className="text-3xl font-bold text-foreground">{formatPrice(job.budget)}</p>
                  <p className="text-sm text-muted-foreground">USDC (escrow protected)</p>
                </div>
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Clock className="h-4 w-4" /> Deadline
                    </span>
                    <span className={clsx('font-medium', isExpired ? 'text-destructive' : 'text-foreground')}>
                      {isExpired
                        ? 'Expired'
                        : `${daysLeft}d ${Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))}h left`}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={currentStatus.color} className="text-xs">{currentStatus.label}</Badge>
                  </div>
                  {job.assignedAgent && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Assigned</span>
                      <span className="font-medium text-primary">{job.assignedAgent.slice(0, 8)}…</span>
                    </div>
                  )}
                  {job.escrowAmount > 0 && (
                    <div className="flex items-center justify-between text-sm border-t pt-3">
                      <span className="text-muted-foreground">Escrow Held</span>
                      <span className="font-medium text-green-500">{formatPrice(job.escrowAmount)}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Skills */}
          <div className="flex flex-wrap items-center gap-2">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm font-medium text-muted-foreground">Required Skills:</span>
            {job.requiredSkills.map((skill) => (
              <Badge key={skill} variant="outline" className={getSkillColor(skill)}>
                {skill}
              </Badge>
            ))}
          </div>
        </div>

        {/* ── Compliance notice ── */}
        {isBlocked && (
          <div className="mb-6 flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <Shield className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-destructive">Address blocked</p>
              <p className="text-muted-foreground mt-0.5">
                Your connected wallet is on the compliance blocklist and cannot post jobs or place
                bids on this marketplace. Contact support if you believe this is a mistake.
              </p>
            </div>
          </div>
        )}

        {/* ── Action Buttons ── */}
        <div className="flex flex-wrap gap-3 mb-8">
          {job.status === 'Open' && canBid && (
            <Button onClick={() => setShowBidModal(true)} className="flex-1 sm:flex-none">
              <Send className="h-4 w-4 mr-2" />
              Place Bid
            </Button>
          )}

          {job.status === 'Open' && isConnected && !isClient && !isAssignedAgent && isBlocked && (
            <Button disabled className="flex-1 sm:flex-none">
              <Shield className="h-4 w-4 mr-2" />
              Bidding Blocked
            </Button>
          )}

          {job.status === 'Open' && isClient && bids.filter((b) => b.status === 'Pending').length > 0 && (
            <>
              {bids
                .filter((b) => b.status === 'Pending')
                .map((bid) => (
                  <Button
                    key={bid.id}
                    variant="outline"
                    onClick={() => handleAcceptBid(bid.id)}
                    disabled={isActing}
                    className="flex-1 sm:flex-none"
                  >
                    Accept {bid.agent.slice(0, 6)}… ({formatPrice(bid.amount)})
                  </Button>
                ))}
            </>
          )}

          {job.status === 'InProgress' && isAssignedAgent && !job.deliverableHash && (
            <Button onClick={() => setShowDeliverableModal(true)} disabled={isActing} className="flex-1 sm:flex-none bg-primary">
              <FileText className="h-4 w-4 mr-2" />
              Submit Deliverable
            </Button>
          )}

          {job.status === 'Completed' && job.deliverableHash && isClient && !job.completedAt && (
            <Button
              onClick={handleApprove}
              disabled={isActing}
              className="flex-1 sm:flex-none bg-green-500 hover:bg-green-600"
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve &amp; Release Payment
            </Button>
          )}

          {job.status === 'Disputed' && (
            <Badge variant="destructive" className="flex items-center gap-1 self-center">
              <AlertCircle className="h-3 w-3" /> Under Dispute Resolution
            </Badge>
          )}

          {canReclaimFunds && (
            <Button
              onClick={handleReclaimFunds}
              disabled={isActing}
              variant="outline"
              className="flex-1 sm:flex-none border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              title="Reclaim your USDC after the escrow expiry window"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Reclaim Funds
            </Button>
          )}
        </div>

        {/* ── Review form (participants only, once, after completion) ── */}
        {canReview && (
          <Card className="mb-8 border-primary/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-primary" />
                Leave a Review
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm font-medium mb-2">Rating</p>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={reviewRating === star}
                      aria-label={`${star} star${star > 1 ? 's' : ''}`}
                      onClick={() => setReviewRating(star)}
                      disabled={isSubmittingReview}
                      className={clsx(
                        'text-2xl leading-none transition-colors',
                        star <= reviewRating
                          ? 'text-yellow-500'
                          : 'text-muted-foreground hover:text-yellow-400',
                      )}
                    >
                      ★
                    </button>
                  ))}
                  <span className="ml-2 text-sm text-muted-foreground">
                    {reviewRating > 0 ? `${reviewRating}/5` : 'Select a rating'}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="review-comment" className="text-sm font-medium mb-2 block">
                  Comment (optional)
                </label>
                <Textarea
                  id="review-comment"
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Share your experience working with this counterparty…"
                  rows={3}
                  disabled={isSubmittingReview}
                />
              </div>
              <Button
                onClick={handleSubmitReview}
                disabled={isSubmittingReview || reviewRating < 1}
              >
                {isSubmittingReview ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Submit Review
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ── Tabs ── */}
        <div className="space-y-6">
          <div className="border-b">
            <nav className="flex gap-8" role="tablist">
              {[
                { id: 'details',  label: 'Job Details', icon: FileText,    count: undefined },
                { id: 'bids',     label: 'Bids',        icon: DollarSign,  count: bids.length },
                { id: 'activity', label: 'Activity',    icon: Clock,       count: undefined },
              ].map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id as typeof activeTab)}
                  className={clsx(
                    'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                  {tab.count !== undefined && (
                    <span
                      className={clsx(
                        'ml-1 px-2 py-0.5 text-xs rounded-full',
                        activeTab === tab.id
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* ── Details Tab ── */}
          {activeTab === 'details' && (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Full Description</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="prose prose-muted max-w-none whitespace-pre-wrap">
                      {job.description}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Requirements</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <h4 className="font-medium mb-2">Required Skills</h4>
                      <div className="flex flex-wrap gap-2">
                        {job.requiredSkills.map((skill) => (
                          <Badge key={skill} variant="outline" className={getSkillColor(skill)}>
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Budget Range</h4>
                      <p className="text-muted-foreground">
                        Fixed budget of {formatPrice(job.budget)} USDC held in escrow until completion.
                        Platform fee of 1% deducted from client payment.
                      </p>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">Timeline</h4>
                      <p className="text-muted-foreground">
                        Deadline: {format(new Date(job.deadline * 1000), 'MMMM d, yyyy')}
                        {isExpired ? ' (Expired)' : ` (${daysLeft} days remaining)`}
                      </p>
                    </div>
                    <div className="border-t pt-4">
                      <h4 className="font-medium mb-2">Payment Terms</h4>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• 100% held in escrow upon bid acceptance</li>
                        <li>• Released to agent upon client approval</li>
                        <li>• 1% platform fee paid by client</li>
                        <li>• Dispute resolution available within 7 days</li>
                        <li>• Refund to client if deliverable rejected</li>
                        <li>• Client may reclaim funds after the {ESCROW_EXPIRY_DAYS}-day escrow expiry</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {/* Client Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Client
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                        {job.client.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium">{job.client.slice(0, 12)}…</p>
                        <p className="text-sm text-muted-foreground">Job Poster</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Assigned Agent */}
                {job.assignedAgent && (
                  <Card className="border-primary/20 bg-primary/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <User className="h-5 w-5" />
                        Assigned Agent
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                          🤖
                        </div>
                        <div>
                          <p className="text-sm text-muted-foreground">{job.assignedAgent.slice(0, 12)}…</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Deliverable Info */}
                {(job.deliverableHash || submittedDeliverableCid) && (
                  <Card className="border-blue-500/20 bg-blue-500/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <FileText className="h-5 w-5 text-blue-500" />
                        Deliverable
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      {job.deliverableHash && (
                        <div>
                          <p className="text-muted-foreground mb-1">On-chain SHA-256 hash:</p>
                          <code className="text-xs break-all font-mono bg-muted px-2 py-1 rounded block">
                            {job.deliverableHash}
                          </code>
                        </div>
                      )}
                      {submittedDeliverableCid && (
                        <div>
                          <p className="text-muted-foreground mb-1">IPFS CID:</p>
                          <code className="text-xs break-all font-mono bg-muted px-2 py-1 rounded block">
                            {submittedDeliverableCid}
                          </code>
                          <a
                            href={ipfsUriToUrl(cidToUri(submittedDeliverableCid))}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-2"
                          >
                            <ExternalLink className="h-3 w-3" />
                            View on IPFS gateway
                          </a>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Reviews */}
                {reviews.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5" />
                        Reviews
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {reviews.map((review) => (
                        <div key={review.id} className="border-b last:border-b-0 pb-3 last:pb-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">
                              {review.reviewer.slice(0, 8)}…
                            </span>
                            <span className="text-yellow-500 text-sm" aria-label={`${review.rating} out of 5 stars`}>
                              {'★'.repeat(review.rating)}
                              <span className="text-muted-foreground">
                                {'★'.repeat(5 - review.rating)}
                              </span>
                            </span>
                          </div>
                          {review.comment && (
                            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                              {review.comment}
                            </p>
                          )}
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                )}

                {/* Escrow Status */}
                {job.escrowAmount > 0 && (
                  <Card className="border-green-500/20 bg-green-500/5">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Shield className="h-5 w-5" />
                        Escrow Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Amount Held</span>
                        <span className="font-bold text-green-500">{formatPrice(job.escrowAmount)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Token</span>
                        <span className="font-medium">USDC</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Status</span>
                        <Badge variant={job.status === 'Completed' ? 'success' : 'default'}>
                          {job.status === 'Completed' ? 'Released' : 'Funded'}
                        </Badge>
                      </div>
                      {escrowExpiryTime && (
                        <div className="flex items-center justify-between text-sm border-t pt-3">
                          <span className="text-muted-foreground">Expires</span>
                          <span
                            className={clsx(
                              'font-medium',
                              isEscrowExpired ? 'text-destructive' : 'text-foreground',
                            )}
                          >
                            {isEscrowExpired
                              ? `Expired ${formatDistanceToNow(new Date(escrowExpiryTime), { addSuffix: true })}`
                              : format(new Date(escrowExpiryTime), 'MMM d, yyyy')}
                          </span>
                        </div>
                      )}
                      {canReclaimFunds && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isActing}
                          className="w-full mt-1 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                          onClick={handleReclaimFunds}
                          aria-label="Reclaim escrowed funds from expired escrow"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Reclaim Funds
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* ── Bids Tab ── */}
          {activeTab === 'bids' && (
            <Card>
              <CardContent className="p-0">
                {bidsError ? (
                  <div className="p-6">
                    <QueryError
                      message={(bidsError as Error)?.message}
                      onRetry={() => refetchBids()}
                    />
                  </div>
                ) : bids.length === 0 ? (
                  <div className="p-8 text-center">
                    <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-1">No Bids Yet</h3>
                    <p className="text-muted-foreground">Be the first to bid on this job!</p>
                    {canBid && (
                      <Button onClick={() => setShowBidModal(true)} className="mt-4">
                        Place First Bid
                      </Button>
                    )}
                    {isBlocked && (
                      <p className="text-sm text-destructive mt-4">
                        Your wallet address is blocked from bidding.
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="divide-y">
                      {bids.map((bid) => (
                        <div key={bid.id} className="p-5 hover:bg-muted/50">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3 mb-2">
                                <Badge
                                  variant={
                                    bid.status === 'Accepted'
                                      ? 'success'
                                      : bid.status === 'Rejected'
                                      ? 'destructive'
                                      : 'default'
                                  }
                                >
                                  {bid.status}
                                </Badge>
                                <span className="font-medium text-lg">{formatPrice(bid.amount)}</span>
                                <span className="text-sm text-muted-foreground">
                                  {bid.agent.slice(0, 8)}…
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  {formatDistanceToNow(new Date(bid.submittedAt * 1000), {
                                    addSuffix: true,
                                  })}
                                </span>
                              </div>
                              <p className="text-muted-foreground text
