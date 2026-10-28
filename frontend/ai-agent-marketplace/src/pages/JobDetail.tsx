import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import {
  DollarSign, Clock, Star, User, CheckCircle, AlertCircle,
  ArrowLeft, Send, Wallet, Loader2, ExternalLink,
  Shield, FileText, XCircle, RefreshCw,
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useStellar } from '@/contexts/StellarContext';
import type { Bid, Job } from '@/lib/types';
import { QueryError } from '@/components/ui/QueryError';
import { formatPrice, getSkillColor } from '@/pages/Marketplace';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

/**
 * Number of days after escrow creation beyond which the client may reclaim
 * funds.  Must match the `escrow_expiry_days` value configured at contract
 * initialisation time.
 */
const ESCROW_EXPIRY_DAYS = 30;

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
  const [isActing, setIsActing] = useState(false);

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

  // ── bids query (fetched separately via the index) ──────────────────────────
  const {
    data: bids = [],
    error: bidsError,
    refetch: refetchBids,
  } = useQuery<Bid[]>({
    queryKey: ['job-bids', jobIdNum],
    queryFn: async () => {
      const client = getContractClient();
      if (!client) return [];
      const ids = await client.getBidsByJob(jobIdNum, 0, 50);
      return Promise.all(ids.map((id) => client.getBid(id)));
    },
    enabled: !!jobIdNum,
  });

  // ── derived state ──────────────────────────────────────────────────────────
  const isClient = publicKey === job?.client;
  const isAssignedAgent = publicKey === job?.assignedAgent;
  const canBid = isConnected && !isClient && job?.status === 'Open' && !isAssignedAgent;

  // ── action handlers (sign + submit real Soroban transactions) ─────────────
  const handleBid = async () => {
    if (!publicKey) return;
    const client = getContractClient();
    if (!client) {
      alert('Not connected to the marketplace contract. Configure it in Settings.');
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
      alert('Bid placed successfully!');
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
    setIsActing(true);
    try {
      // The contract stores a 32-byte proof hash on-chain; the actual
      // deliverable content/link lives off-chain (e.g. IPFS) and is hashed here.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deliverableNote));
      await client.submitDeliverable(publicKey, signTransaction, jobIdNum, new Uint8Array(digest));
      setShowDeliverableModal(false);
      setDeliverableNote('');
      await queryClient.invalidateQueries({ queryKey: ['job', jobIdNum] });
      alert('Deliverable submitted!');
    } catch (err) {
      console.error('Submit failed:', err);
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

        {/* ── Action Buttons ── */}
        <div className="flex flex-wrap gap-3 mb-8">
          {job.status === 'Open' && canBid && (
            <Button onClick={() => setShowBidModal(true)} className="flex-1 sm:flex-none">
              <Send className="h-4 w-4 mr-2" />
              Place Bid
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
                  </div>
                ) : (
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
                            <p className="text-muted-foreground text-sm mb-2">{bid.proposal}</p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>
                                Timeline:{' '}
                                {Math.max(
                                  0,
                                  Math.ceil(
                                    (bid.proposedTimeline * 1000 - Date.now()) /
                                      (1000 * 60 * 60 * 24),
                                  ),
                                )}{' '}
                                days
                              </span>
                              <span>Agent ID: #{bid.agentId}</span>
                            </div>
                          </div>
                          {isClient && bid.status === 'Pending' && (
                            <Button size="sm" onClick={() => handleAcceptBid(bid.id)} disabled={isActing}>
                              Accept Bid
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Activity Tab ── */}
          {activeTab === 'activity' && (
            <Card>
              <CardContent className="p-0">
                <div className="divide-y">
                  <ActivityItem
                    icon={DollarSign}
                    color="text-green-500"
                    title="Job Posted"
                    description={`Job created with budget of ${formatPrice(job.budget)}`}
                    time={job.createdAt}
                  />
                  {bids.map((bid) => (
                    <ActivityItem
                      key={bid.id}
                      icon={Send}
                      color="text-primary"
                      title="Bid Received"
                      description={`${bid.agent.slice(0, 8)}… bid ${formatPrice(bid.amount)} (${bid.status})`}
                      time={bid.submittedAt}
                    />
                  ))}
                  {job.assignedAgent && (
                    <ActivityItem
                      icon={CheckCircle}
                      color="text-primary"
                      title="Bid Accepted"
                      description={`Assigned to ${job.assignedAgent.slice(0, 8)}…`}
                      time={job.createdAt + 86400}
                    />
                  )}
                  {job.status === 'InProgress' && (
                    <ActivityItem
                      icon={Clock}
                      color="text-orange-500"
                      title="Work Started"
                      description="Agent began work on the deliverable"
                      time={job.createdAt + 86400 * 2}
                    />
                  )}
                  {job.deliverableHash && (
                    <ActivityItem
                      icon={FileText}
                      color="text-blue-500"
                      title="Deliverable Submitted"
                      description="Agent submitted work for review"
                      time={job.createdAt + 86400 * 5}
                    />
                  )}
                  {job.status === 'Completed' && job.completedAt && (
                    <ActivityItem
                      icon={CheckCircle}
                      color="text-green-500"
                      title="Job Completed"
                      description="Client approved deliverable, payment released"
                      time={job.completedAt}
                    />
                  )}
                  {job.disputeRaised && (
                    <ActivityItem
                      icon={AlertCircle}
                      color="text-destructive"
                      title="Dispute Raised"
                      description="Dispute resolution initiated"
                      time={job.createdAt + 86400 * 7}
                    />
                  )}
                  {job.status === 'Refunded' && (
                    <ActivityItem
                      icon={XCircle}
                      color="text-destructive"
                      title="Refunded"
                      description="Payment refunded to client"
                      time={job.createdAt + 86400 * 10}
                    />
                  )}
                  {job.escrowCreatedAt && isEscrowExpired && (
                    <ActivityItem
                      icon={RefreshCw}
                      color="text-orange-500"
                      title="Escrow Funds Reclaimed"
                      description="Client reclaimed escrowed funds after expiry window"
                      time={job.escrowCreatedAt + ESCROW_EXPIRY_DAYS * 86400 + 1}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* ── Bid Modal ── */}
      {showBidModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Place Bid on "{job.title}"</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-3 bg-muted rounded-lg text-sm">
                <p className="text-muted-foreground">
                  Budget:{' '}
                  <span className="font-medium text-foreground">{formatPrice(job.budget)}</span>
                </p>
                <p className="text-muted-foreground">
                  Minimum bid:{' '}
                  <span className="font-medium text-foreground">
                    {formatPrice(job.budget / 2)}
                  </span>{' '}
                  (50% of budget)
                </p>
              </div>
              <Input
                label="Your Bid Amount (USDC)"
                type="number"
                step="0.01"
                min={job.budget / 2 / 10000000}
                max={job.budget / 10000000}
                value={bidAmount}
                onChange={(e) => setBidAmount(e.target.value)}
                placeholder="e.g., 100.00"
              />
              <Input
                label="Proposed Timeline (days)"
                type="number"
                min="1"
                max={daysLeft > 0 ? daysLeft : 30}
                value={bidTimeline}
                onChange={(e) => setBidTimeline(e.target.value)}
                placeholder="e.g., 7"
              />
              <Textarea
                label="Proposal"
                value={bidProposal}
                onChange={(e) => setBidProposal(e.target.value)}
                placeholder="Describe your approach, relevant experience, and why you're the best fit for this job…"
                rows={4}
              />
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowBidModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleBid}
                  className="flex-1"
                  disabled={!bidAmount || !bidTimeline || !bidProposal || isActing}
                  isLoading={isActing}
                >
                  Submit Bid
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Submit Deliverable Modal ── */}
      {showDeliverableModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto">
            <CardHeader>
              <CardTitle>Submit Deliverable for "{job.title}"</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                label="Deliverable Summary / Link"
                value={deliverableNote}
                onChange={(e) => setDeliverableNote(e.target.value)}
                placeholder="Describe the completed work or link to it (e.g. an IPFS or GitHub URL). This is hashed and stored on-chain as proof of delivery."
                rows={4}
              />
              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setShowDeliverableModal(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmitDeliverable}
                  className="flex-1"
                  disabled={!deliverableNote || isActing}
                  isLoading={isActing}
                >
                  Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

// ── ActivityItem ───────────────────────────────────────────────────────────────
function ActivityItem({
  icon: Icon,
  color,
  title,
  description,
  time,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  description: string;
  time: number;
}) {
  return (
    <div className="p-5 flex gap-4">
      <div
        className={clsx(
          'flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center',
          `${color}/10`,
        )}
      >
        <Icon className={clsx('h-5 w-5', color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm text-muted-foreground">
          {format(new Date(time * 1000), 'MMM d, HH:mm')}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(time * 1000), { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

// Mock data removed — JobDetail now reads job, bids and escrow directly from
// the on-chain contract via MarketplaceClient.
