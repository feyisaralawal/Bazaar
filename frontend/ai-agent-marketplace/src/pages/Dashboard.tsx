import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { 
  DollarSign, Clock, Star, User, CheckCircle, AlertCircle, 
  ArrowRight, Send, Wallet, Loader2, Plus, Edit, Trash2,
  TrendingUp, Activity, FileText, Shield, MessageSquare
} from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useStellar } from '@/contexts/StellarContext';
import type { Agent, Bid, Job, PlatformStats } from '@/lib/types';
import { QueryError } from '@/components/ui/QueryError';
import { formatPrice, getSkillColor } from '@/pages/Marketplace';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

/** Number of items fetched per page from the contract. */
const PAGE_SIZE = 20;

const statusConfig = {
  Open: { label: 'Open', color: 'success' as const, icon: DollarSign },
  InProgress: { label: 'In Progress', color: 'default' as const, icon: Clock },
  Completed: { label: 'Completed', color: 'success' as const, icon: CheckCircle },
  Disputed: { label: 'Disputed', color: 'destructive' as const, icon: AlertCircle },
  Cancelled: { label: 'Cancelled', color: 'secondary' as const, icon: AlertCircle },
  Refunded: { label: 'Refunded', color: 'secondary' as const, icon: AlertCircle },
};

export const Dashboard: React.FC = () => {
  const { publicKey, isConnected } = useWallet();
  const { getContractClient } = useStellar();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'myJobs' | 'myBids' | 'myAgent' | 'reviews'>('overview');

  if (!isConnected || !publicKey) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Connect Wallet</h2>
            <p className="text-muted-foreground mb-6">Connect your Freighter wallet to access your dashboard</p>
            <Button onClick={() => navigate('/marketplace')} className="w-full">
              Go to Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const {
    data: myJobsPages,
    isLoading: jobsLoading,
    error: jobsError,
    refetch: refetchJobs,
    fetchNextPage: fetchNextJobsPage,
    hasNextPage: hasNextJobsPage,
    isFetchingNextPage: isFetchingNextJobsPage,
  } = useInfiniteQuery<Job[]>({
    queryKey: ['myJobs', publicKey],
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      const ids: number[] = await client.getJobsByClient(publicKey, offset, PAGE_SIZE);
      return Promise.all(ids.map((id: number) => client.getJob(id)));
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE
        ? allPages.reduce((sum, p) => sum + p.length, 0)
        : undefined,
  });

  const {
    data: myBidsPages,
    isLoading: bidsLoading,
    error: bidsError,
    refetch: refetchBids,
    fetchNextPage: fetchNextBidsPage,
    hasNextPage: hasNextBidsPage,
    isFetchingNextPage: isFetchingNextBidsPage,
  } = useInfiniteQuery<Bid[]>({
    queryKey: ['myBids', publicKey],
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      const ids: number[] = await client.getBidsByAgent(publicKey, offset, PAGE_SIZE);
      return Promise.all(ids.map((id: number) => client.getBid(id)));
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE
        ? allPages.reduce((sum, p) => sum + p.length, 0)
        : undefined,
  });

  // Flatten paginated results
  const myJobs: Job[] = myJobsPages?.pages.flat() ?? [];
  const myBids: Bid[] = myBidsPages?.pages.flat() ?? [];

  // Sentinel refs for infinite scroll
  const jobsSentinelRef = useRef<HTMLDivElement>(null);
  const bidsSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextJobsPage && !isFetchingNextJobsPage) {
          fetchNextJobsPage();
        }
      },
      { threshold: 0.1 }
    );
    if (jobsSentinelRef.current) observer.observe(jobsSentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextJobsPage, isFetchingNextJobsPage, fetchNextJobsPage]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && hasNextBidsPage && !isFetchingNextBidsPage) {
          fetchNextBidsPage();
        }
      },
      { threshold: 0.1 }
    );
    if (bidsSentinelRef.current) observer.observe(bidsSentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextBidsPage, isFetchingNextBidsPage, fetchNextBidsPage]);

  const { data: myAgent, error: myAgentError, refetch: refetchMyAgent } = useQuery<Agent | null>({
    queryKey: ['myAgent', publicKey],
    queryFn: async () => {
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      return client.getAgentByOwner(publicKey);
    },
  });

  const { data: stats } = useQuery<PlatformStats>({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      return client.getPlatformStats();
    },
    staleTime: 1000 * 60 * 10,
  });



  const tabsList = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'myJobs', label: 'My Jobs', count: myJobs.length, icon: FileText },
    { id: 'myBids', label: 'My Bids', count: myBids.length, icon: Send },
    { id: 'myAgent', label: 'My Agent', icon: Activity },
    { id: 'reviews', label: 'Reviews', icon: MessageSquare },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold">Dashboard</h1>
              <p className="text-muted-foreground">Manage your jobs, bids, and agent profile</p>
            </div>
            <div className="flex gap-3">
              <Link to="/create-job">
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Post Job
                </Button>
              </Link>
              {!myAgent && (
                <Link to="/register-agent">
                  <Button variant="outline">
                    <Activity className="h-4 w-4 mr-2" />
                    Register Agent
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard 
            label="Active Jobs" 
            value={myJobs.filter(j => j.status === 'InProgress').length} 
            icon={Activity} 
            color="text-primary" 
          />
          <StatCard 
            label="Pending Bids" 
            value={myBids.filter((b: Bid) => b.status === 'Pending').length} 
            icon={Send} 
            color="text-stellar" 
          />
          <StatCard 
            label="Total Earned" 
            value={myAgent ? formatPrice(myAgent.totalEarnings) : '$0'} 
            icon={DollarSign} 
            color="text-green-500" 
          />
          <StatCard 
            label="Reputation" 
            value={myAgent ? myAgent.reputation.toFixed(1) : 'N/A'} 
            icon={Star} 
            color="text-yellow-500" 
          />
        </div>

        {/* Tabs */}
        <div className="border-b mb-6">
          <nav className="flex gap-8" role="tablist">
            {tabsList.map(tab => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={clsx(
                  'py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-2',
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
                {tab.count !== undefined && (
                  <span className={clsx('ml-1 px-2 py-0.5 text-xs rounded-full', activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid lg:grid-cols-3 gap-6 mb-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {myJobs.slice(0, 5).map(job => (
                      <ActivityItem 
                        key={job.id}
                        icon={statusConfig[job.status].icon}
                        color={statusConfig[job.status].color === 'success' ? 'text-green-500' : 
                              statusConfig[job.status].color === 'destructive' ? 'text-destructive' :
                              statusConfig[job.status].color === 'default' ? 'text-primary' : 'text-muted'}
                        title={job.title}
                        description={job.status === 'InProgress' ? 'Work in progress' : 
                                   job.status === 'Completed' ? 'Payment released' :
                                   job.status === 'Open' ? 'Waiting for bids' : job.status}
                        time={job.createdAt}
                        status={job.status}
                      />
                    ))}
                    {myJobs.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
                        <p>No jobs yet. <Link to="/create-job" className="text-primary hover:underline">Post your first job</Link></p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Link to="/create-job">
                    <Button variant="outline" className="w-full justify-start gap-3">
                      <FileText className="h-4 w-4" />
                      <span>Post a New Job</span>
                    </Button>
                  </Link>
                  {!myAgent ? (
                    <Link to="/register-agent">
                      <Button variant="outline" className="w-full justify-start gap-3">
                        <Activity className="h-4 w-4" />
                        <span>Register as Agent</span>
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate(`/agent/${myAgent.id}`)}>
                      <Activity className="h-4 w-4" />
                      <span>View My Agent Profile</span>
                    </Button>
                  )}
                  <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate('/marketplace')}>
                    <Send className="h-4 w-4" />
                    <span>Browse Marketplace</span>
                  </Button>
                  <Button variant="outline" className="w-full justify-start gap-3" onClick={() => navigate('/settings')}>
                    <Shield className="h-4 w-4" />
                    <span>Account Settings</span>
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* Platform Stats */}
            {stats && (
              <Card>
                <CardHeader>
                  <CardTitle>Platform Overview</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                    <StatItem label="Total Agents" value={stats.totalAgents} />
                    <StatItem label="Total Jobs" value={stats.totalJobs} />
                    <StatItem label="Volume" value={`$${(stats.totalVolume / 10000000).toFixed(1)}M`} />
                    <StatItem label="Fees Collected" value={`$${(stats.totalFeesCollected / 10000000).toFixed(1)}M`} />
                    <StatItem label="Disputes" value={stats.totalDisputes} />
                    <StatItem label="Avg Completion" value={`${(stats.avgJobCompletionTime / 86400).toFixed(1)} days`} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {activeTab === 'myJobs' && (
          <div className="space-y-4">
            {jobsLoading ? (
              <JobsSkeleton />
            ) : jobsError ? (
              <QueryError message={(jobsError as Error)?.message} onRetry={() => refetchJobs()} />
            ) : myJobs.length === 0 ? (
              <EmptyState 
                icon={FileText} 
                title="No Jobs Yet" 
                description="You haven't posted any jobs yet" 
                action={<Link to="/create-job"><Button>Post Your First Job</Button></Link>} 
              />
            ) : (
              <>
                {myJobs.map(job => (
                  <JobCard key={job.id} job={job} isClient={true} />
                ))}
                {/* Infinite-scroll sentinel */}
                <div ref={jobsSentinelRef} className="flex justify-center py-4" aria-hidden="true">
                  {isFetchingNextJobsPage && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Loading more jobs…
                    </div>
                  )}
                  {!hasNextJobsPage && myJobs.length > 0 && (
                    <p className="text-sm text-muted-foreground">All jobs loaded</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'myBids' && (
          <div className="space-y-4">
            {bidsLoading ? (
              <BidsSkeleton />
            ) : bidsError ? (
              <QueryError message={(bidsError as Error)?.message} onRetry={() => refetchBids()} />
            ) : myBids.length === 0 ? (
              <EmptyState 
                icon={Send} 
                title="No Bids Yet" 
                description="You haven't placed any bids yet" 
                action={<Link to="/marketplace"><Button>Browse Jobs</Button></Link>} 
              />
            ) : (
              <>
                {myBids.map((bid: Bid) => (
                  <BidCard key={bid.id} bid={bid} />
                ))}
                {/* Infinite-scroll sentinel */}
                <div ref={bidsSentinelRef} className="flex justify-center py-4" aria-hidden="true">
                  {isFetchingNextBidsPage && (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      Loading more bids…
                    </div>
                  )}
                  {!hasNextBidsPage && myBids.length > 0 && (
                    <p className="text-sm text-muted-foreground">All bids loaded</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'myAgent' && (
          <div className="space-y-6">
            {myAgentError ? (
              <QueryError message={(myAgentError as Error)?.message} onRetry={() => refetchMyAgent()} />
            ) : myAgent ? (
              <AgentProfileCard agent={myAgent} isOwner={true} />
            ) : (
              <EmptyState 
                icon={Activity} 
                title="No Agent Registered" 
                description="Register as an AI agent to start earning" 
                action={<Link to="/register-agent"><Button>Register Agent</Button></Link>} 
              />
            )}
          </div>
        )}

        {activeTab === 'reviews' && (
          <div className="space-y-4">
            <Card>
              <CardContent className="p-8 text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold mb-1">Reviews</h3>
                <p className="text-muted-foreground mb-4">Reviews from completed jobs will appear here</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <div className={clsx('p-3 rounded-full', `${color}/10`)}>
            <Icon className={clsx('h-5 w-5', color)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatItem({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center p-4">
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function ActivityItem({ icon: Icon, color, title, description, time, status }: { 
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  description: string;
  time: number;
  status?: string;
}) {
  return (
    <div className="flex gap-4 p-3 hover:bg-muted/50 rounded-lg transition-colors">
      <div className={clsx('flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center', `${color}/10`)}>
        <Icon className={clsx('h-4 w-4', color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{title}</p>
        <p className="text-sm text-muted-foreground truncate">{description}</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-sm text-muted-foreground">{format(new Date(time * 1000), 'MMM d, HH:mm')}</p>
        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(time * 1000), { addSuffix: true })}</p>
      </div>
    </div>
  );
}

function JobCard({ job, isClient }: { job: Job; isClient: boolean }) {
  const timeLeft = job.deadline * 1000 - Date.now();
  const daysLeft = Math.max(0, Math.ceil(timeLeft / (1000 * 60 * 60 * 24)));
  const isExpired = timeLeft <= 0;
  const statusCfg = statusConfig[job.status];

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="font-semibold text-lg">{job.title}</h3>
              <Badge variant={statusCfg.color}>{statusCfg.label}</Badge>
              {job.disputeRaised && <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Dispute</Badge>}
            </div>
            <p className="text-muted-foreground text-sm line-clamp-2">{job.description}</p>
            <div className="flex flex-wrap gap-2 mt-3">
              {job.requiredSkills.map(skill => (
                <Badge key={skill} variant="outline" className={getSkillColor(skill)}>{skill}</Badge>
              ))}
            </div>
          </div>
          
          <div className="flex flex-col items-end md:w-64 gap-2">
            <div className="text-right">
              <p className="text-2xl font-bold text-foreground">{formatPrice(job.budget)}</p>
              <p className="text-sm text-muted-foreground">Budget</p>
            </div>
            <div className={clsx('text-sm', isExpired ? 'text-destructive' : 'text-muted-foreground')}>
              {isExpired ? 'Expired' : `${daysLeft}d left`}
            </div>
            {job.assignedAgent && (
              <div className="text-sm text-muted-foreground">
                Agent: {job.assignedAgent.slice(0, 8)}...
              </div>
            )}
            {job.escrowAmount > 0 && (
              <div className="text-sm text-green-500 font-medium">
                Escrow: {formatPrice(job.escrowAmount)}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
          {job.status === 'Open' && (
            <Link to={`/job/${job.id}`}>
              <Button variant="outline" size="sm">View Bids</Button>
            </Link>
          )}
          {job.status === 'InProgress' && !job.deliverableHash && (
            <Button variant="outline" size="sm" disabled>
              Waiting for Deliverable
            </Button>
          )}
          {job.status === 'Completed' && job.deliverableHash && isClient && !job.completedAt && (
            <Button size="sm" className="bg-green-500 hover:bg-green-600">
              <CheckCircle className="h-4 w-4 mr-2" />
              Approve & Release
            </Button>
          )}
          {job.status === 'Completed' && (
            <Link to={`/job/${job.id}`}>
              <Button variant="ghost" size="sm">View Details</Button>
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function BidCard({ bid }: { bid: Bid }) {
  const statusCfg = {
    Pending: { label: 'Pending', color: 'default' as const },
    Accepted: { label: 'Accepted', color: 'success' as const },
    Rejected: { label: 'Rejected', color: 'destructive' as const },
    Withdrawn: { label: 'Withdrawn', color: 'secondary' as const },
  }[bid.status] ?? { label: bid.status, color: 'secondary' as const };

  const timelineDays = bid.proposedTimeline
    ? Math.max(0, Math.ceil((bid.proposedTimeline * 1000 - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="font-semibold text-foreground">Bid #{bid.id}</span>
              <Badge variant={statusCfg.color}>{statusCfg.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Amount: {formatPrice(bid.amount)}
              {timelineDays !== null ? ` • ${timelineDays}d timeline` : ''}
            </p>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{bid.proposal}</p>
            <p className="text-xs text-muted-foreground mt-1">
              For job #{bid.agentId} · Agent {bid.agent.slice(0, 8)}...
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Submitted</p>
            <p className="font-medium">{formatDistanceToNow(new Date(bid.submittedAt * 1000), { addSuffix: true })}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentProfileCard({ agent, isOwner }: { agent: Agent; isOwner: boolean }) {
  const verifiedSkills = Object.entries(agent.skillsVerified).filter(([_, v]) => v).map(([k]) => k);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-primary to-stellar flex items-center justify-center text-4xl mx-auto md:mx-0">
              🤖
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-2xl font-bold">{agent.name}</h2>
              <p className="text-muted-foreground">ID: #{agent.id} • Owner: {agent.owner.slice(0, 8)}...</p>
              <div className="flex items-center justify-center md:justify-start gap-4 mt-3">
                <span className="flex items-center gap-1 text-yellow-500">
                  <Star className="h-5 w-5 fill-current" />
                  {agent.reputation.toFixed(1)}
                </span>
                <span className="text-muted-foreground">{agent.totalJobsCompleted} jobs completed</span>
                <span className="text-muted-foreground">{formatPrice(agent.totalEarnings)} earned</span>
              </div>
            </div>
            <div className="flex gap-2">
              {isOwner && (
                <Link to="/register-agent">
                  <Button variant="outline">
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Profile
                  </Button>
                </Link>
              )}
              <Link to={`/agent/${agent.id}`}>
                <Button>View Public Profile</Button>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {agent.skills.map(skill => (
              <Badge
                key={skill}
                variant={verifiedSkills.includes(skill) ? 'default' : 'outline'}
                className={clsx(getSkillColor(skill))}
              >
                {skill}
                {verifiedSkills.includes(skill) && <CheckCircle className="ml-1 h-3 w-3" />}
              </Badge>
            ))}
          </div>
          {agent.skills.some(s => !verifiedSkills.includes(s)) && (
            <p className="text-sm text-muted-foreground mt-3">
              Unverified skills don't have third-party verification yet. 
              <Link to="#" className="text-primary hover:underline ml-1">Learn about verification</Link>
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-primary">{agent.totalJobsCompleted}</p>
              <p className="text-sm text-muted-foreground">Jobs Completed</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-green-500">{formatPrice(agent.totalEarnings)}</p>
              <p className="text-sm text-muted-foreground">Total Earnings</p>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-3xl font-bold text-yellow-500">{agent.reputation.toFixed(1)}</p>
              <p className="text-sm text-muted-foreground">Reputation Score</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function JobsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="flex gap-4">
              <div className="flex-1 space-y-3">
                <div className="h-6 w-3/4 animate-pulse bg-muted rounded" />
                <div className="h-4 w-1/2 animate-pulse bg-muted rounded" />
                <div className="flex gap-2">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="h-6 w-20 animate-pulse bg-muted rounded-full" />
                  ))}
                </div>
              </div>
              <div className="w-48 h-24 animate-pulse bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function BidsSkeleton() {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-5">
            <div className="flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-5 w-1/3 animate-pulse bg-muted rounded" />
                <div className="h-4 w-1/2 animate-pulse bg-muted rounded" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }: { 
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-12 text-center">
        <Icon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-6">{description}</p>
        {action}
      </CardContent>
    </Card>
  );
}

// Mock data removed — Dashboard now reads my-jobs, my-bids, my-agent and
// platform stats directly from the on-chain contract via MarketplaceClient.