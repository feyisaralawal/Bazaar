import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useInfiniteQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Star, DollarSign, Clock, CheckCircle, Award, Shield, ExternalLink, MessageSquare, ArrowLeft, Wallet, Send, AlertCircle, Loader2 } from 'lucide-react';
import { useWallet } from '@/contexts/WalletContext';
import { useStellar } from '@/contexts/StellarContext';
import type { Agent, Bid, Job, Review } from '@/lib/types';
import { QueryError } from '@/components/ui/QueryError';
import { formatPrice, getSkillColor } from '@/pages/Marketplace';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

/** Number of items fetched per page from the contract. */
const PAGE_SIZE = 20;

export const AgentProfile: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();
  const { publicKey, isConnected } = useWallet();
  const { getContractClient } = useStellar();
  const [activeTab, setActiveTab] = useState<'overview' | 'jobs' | 'reviews'>('overview');

  const agentIdNum = parseInt(agentId || '0');

  // Fetch agent data
  const { data: agent, isLoading, error } = useQuery<Agent>({
    queryKey: ['agent', agentIdNum],
    queryFn: async () => {
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      return client.getAgent(agentIdNum);
    },
    enabled: !!agentIdNum,
  });

  // Fetch agent's jobs (paginated)
  const {
    data: jobsPages,
    fetchNextPage: fetchNextJobsPage,
    hasNextPage: hasNextJobsPage,
    isFetchingNextPage: isFetchingNextJobsPage,
    error: jobsError,
    refetch: refetchJobs,
  } = useInfiniteQuery<Job[]>({
    queryKey: ['agent-jobs', agentIdNum],
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      if (!agent) return [];
      const ids: number[] = await client.getJobsByAgent(agent.owner, offset, PAGE_SIZE);
      return Promise.all(ids.map((id: number) => client.getJob(id)));
    },
    initialPageParam: 0,
    enabled: !!agentIdNum && !!agent,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE
        ? allPages.reduce((sum, p) => sum + p.length, 0)
        : undefined,
  });

  // Fetch reviews (paginated)
  const {
    data: reviewsPages,
    fetchNextPage: fetchNextReviewsPage,
    hasNextPage: hasNextReviewsPage,
    isFetchingNextPage: isFetchingNextReviewsPage,
    error: reviewsError,
    refetch: refetchReviews,
  } = useInfiniteQuery<Review[]>({
    queryKey: ['agent-reviews', agentIdNum],
    queryFn: async ({ pageParam }) => {
      const offset = (pageParam as number) ?? 0;
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }
      if (!agent) return [];
      const ids: number[] = await client.getReviewsByReviewee(agent.owner, offset, PAGE_SIZE);
      return Promise.all(ids.map((id: number) => client.getReview(id)));
    },
    initialPageParam: 0,
    enabled: !!agentIdNum && !!agent,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length === PAGE_SIZE
        ? allPages.reduce((sum, p) => sum + p.length, 0)
        : undefined,
  });

  // Flatten paginated results
  const jobs: Job[] = jobsPages?.pages.flat() ?? [];
  const reviews: Review[] = reviewsPages?.pages.flat() ?? [];

  // Sentinel refs for infinite scroll
  const jobsSentinelRef = useRef<HTMLDivElement>(null);
  const reviewsSentinelRef = useRef<HTMLDivElement>(null);

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
        if (entries[0].isIntersecting && hasNextReviewsPage && !isFetchingNextReviewsPage) {
          fetchNextReviewsPage();
        }
      },
      { threshold: 0.1 }
    );
    if (reviewsSentinelRef.current) observer.observe(reviewsSentinelRef.current);
    return () => observer.disconnect();
  }, [hasNextReviewsPage, isFetchingNextReviewsPage, fetchNextReviewsPage]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Agent Not Found</h2>
            <p className="text-muted-foreground mb-4">This agent doesn't exist or has been deactivated.</p>
            <Button onClick={() => navigate('/marketplace')}>Browse Marketplace</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOwner = publicKey === agent.owner;

  const rating = agent.reputation;
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link to="/marketplace" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Marketplace</span>
            </Link>
            <div className="flex items-center gap-3">
              {isOwner && (
                <Link to="/dashboard" className="btn-secondary">
                  <Wallet className="h-4 w-4 mr-2" />
                  Dashboard
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Agent Header */}
        <div className="grid lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <Badge variant="secondary" className="text-sm">
                    {agent.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">Joined {format(new Date(agent.createdAt * 1000), 'MMM yyyy')}</span>
                </div>
                <h1 className="text-3xl lg:text-4xl font-bold text-foreground mb-2">{agent.name}</h1>
                <p className="text-lg text-muted-foreground max-w-2xl">{agent.description}</p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className={clsx(
                          'h-6 w-6',
                          i < fullStars ? 'fill-yellow-400 text-yellow-400' :
                          i === fullStars && hasHalfStar ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                        )}
                      />
                    ))}
                    <span className="ml-2 text-lg font-bold">{rating.toFixed(1)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{agent.totalJobsCompleted} jobs completed</p>
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Earnings" value={formatPrice(agent.totalEarnings)} icon={<DollarSign />} color="text-green-500" />
              <StatCard label="Jobs Completed" value={agent.totalJobsCompleted} icon={<CheckCircle />} color="text-primary" />
              <StatCard label="Price/Task" value={formatPrice(agent.pricePerTask)} icon={<DollarSign />} color="text-stellar" />
              <StatCard label="Reputation" value={rating.toFixed(1)} icon={<Award />} color="text-yellow-500" />
            </div>

            {/* Skills */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Skills</h3>
              <div className="flex flex-wrap gap-2">
                {agent.skills.map((skill, i) => (
                  <Badge
                    key={skill}
                    variant={agent.skillsVerified[skill] ? 'default' : 'outline'}
                    className={clsx(getSkillColor(skill), 'gap-1')}
                  >
                    {skill}
                    {agent.skillsVerified[skill] && <Shield className="h-3 w-3" />}
                  </Badge>
                ))}
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                {Object.values(agent.skillsVerified).filter(v => v).length} of {agent.skills.length} skills verified
              </p>
            </div>

            {/* Owner Actions */}
            {isOwner && (
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium">Owner Dashboard</p>
                      <p className="text-sm text-muted-foreground">Manage your agent, view analytics, and update settings</p>
                    </div>
                    <Link to="/dashboard">
                      <Button>Open Dashboard</Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Hire CTA for non-owners. On-chain, agents bid on client-posted
                jobs (there's no direct "hire" call), so this links to job
                creation rather than submitting a bid on the viewer's behalf. */}
            {!isOwner && isConnected && agent.isActive && (
              <Card className="border-green-500/20 bg-green-500/5">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="font-medium text-green-500">Available for Hire</p>
                      <p className="text-sm text-muted-foreground">Starting at {formatPrice(agent.pricePerTask)} per task</p>
                    </div>
                    <Link to="/create-job">
                      <Button className="bg-green-500 hover:bg-green-600">
                        <Send className="h-4 w-4 mr-2" />
                        Post a Job for This Agent
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}

            {!isConnected && !isOwner && (
              <Card className="border-muted/20">
                <CardContent className="p-4 text-center">
                  <p className="text-muted-foreground">Connect your wallet to hire this agent</p>
                  <Button className="mt-2" onClick={() => navigate('/marketplace')}>
                    Connect Wallet
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Agent Card */}
            <Card>
              <CardContent className="p-6">
                <div className="text-center space-y-4">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-stellar mx-auto flex items-center justify-center text-3xl">
                    🤖
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">{agent.name}</h3>
                    <p className="text-sm text-muted-foreground">ID: #{agent.id}</p>
                  </div>
                  
                  <div className="space-y-3 pt-4 border-t">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="font-medium">{formatPrice(agent.pricePerTask)}/task</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Completed</span>
                      <span className="font-medium">{agent.totalJobsCompleted} jobs</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Earned</span>
                      <span className="font-medium">{formatPrice(agent.totalEarnings)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Member since</span>
                      <span className="font-medium">{format(new Date(agent.createdAt * 1000), 'MMM yyyy')}</span>
                    </div>
                  </div>

                  {agent.metadataUri && (
                    <a
                      href={agent.metadataUri.replace('ipfs://', 'https://ipfs.io/ipfs/')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View Metadata on IPFS
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Verification Status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Verification
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Identity Verified</span>
                  <Badge variant={isOwner ? 'default' : 'outline'} className="text-xs">
                    {isOwner ? 'Verified' : 'On-chain'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Skills Verified</span>
                  <Badge variant="outline" className="text-xs">
                    {Object.values(agent.skillsVerified).filter(v => v).length} / {agent.skills.length}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dispute Rate</span>
                  <Badge variant="outline" className="text-xs text-green-500 border-green-500">
                    &lt; 1%
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tabs */}
        <div className="space-y-6">
          <div className="border-b">
            <nav className="flex gap-8" role="tablist">
              {[
                { id: 'overview', label: 'Overview', count: null },
                { id: 'jobs', label: 'Recent Jobs', count: jobs.length },
                { id: 'reviews', label: 'Reviews', count: reviews.length },
              ].map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={clsx(
                    'py-3 px-1 border-b-2 font-medium text-sm transition-colors',
                    activeTab === tab.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {tab.label}
                  {tab.count !== null && (
                    <span className={clsx('ml-2 px-2 py-0.5 text-xs rounded-full', activeTab === tab.id ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground')}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <Card>
              <CardContent className="p-6">
                <h3 className="text-lg font-semibold mb-4">About This Agent</h3>
                <div className="prose prose-muted max-w-none">
                  <p className="whitespace-pre-wrap">{agent.description}</p>
                </div>
                
                <div className="mt-6 grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-medium mb-3">Technical Stack</h4>
                    <div className="flex flex-wrap gap-2">
                      {agent.skills.map(skill => (
                        <Badge key={skill} variant="outline" className={getSkillColor(skill)}>
                          {skill}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium mb-3">Specializations</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• Custom AI model development</li>
                      <li>• Production ML pipeline deployment</li>
                      <li>• Smart contract integration</li>
                      <li>• Real-time data processing</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'jobs' && (
            <div className="space-y-4">
              {jobsError ? (
                <QueryError message={(jobsError as Error)?.message} onRetry={() => refetchJobs()} />
              ) : jobs.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-1">No Jobs Yet</h3>
                    <p className="text-muted-foreground">This agent hasn't completed any jobs yet.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {jobs.map(job => (
                    <Card key={job.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium">{job.title}</h4>
                              <Badge variant={job.status === 'Completed' ? 'success' : job.status === 'InProgress' ? 'default' : 'outline'}>
                                {job.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-2">{job.description}</p>
                            <div className="flex flex-wrap gap-2 mt-2">
                              {job.requiredSkills.map(s => (
                                <Badge key={s} variant="outline" className={getSkillColor(s)}>{s}</Badge>
                              ))}
                            </div>
                          </div>
                          <div className="text-right md:text-left">
                            <div className="text-lg font-bold text-green-500">{formatPrice(job.budget)}</div>
                            <div className="text-sm text-muted-foreground">
                              Completed {formatDistanceToNow(new Date(job.createdAt * 1000), { addSuffix: true })}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {/* Infinite-scroll sentinel */}
                  <div ref={jobsSentinelRef} className="flex justify-center py-4" aria-hidden="true">
                    {isFetchingNextJobsPage && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Loading more jobs…
                      </div>
                    )}
                    {!hasNextJobsPage && jobs.length > 0 && (
                      <p className="text-sm text-muted-foreground">All jobs loaded</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div className="space-y-4">
              {reviewsError ? (
                <QueryError message={(reviewsError as Error)?.message} onRetry={() => refetchReviews()} />
              ) : reviews.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <MessageSquare className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="font-semibold mb-1">No Reviews Yet</h3>
                    <p className="text-muted-foreground">Reviews appear here after job completion.</p>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {reviews.map((review: Review) => (
                    <Card key={review.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium">
                            {review.reviewer?.charAt(0) || 'C'}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{review.reviewer?.slice(0, 8)}...</span>
                              <span className="text-sm text-muted-foreground">{format(new Date(review.createdAt * 1000), 'MMM d, yyyy')}</span>
                            </div>
                            <div className="flex items-center gap-1 mb-2">
                              {[...Array(5)].map((_, i) => (
                                <Star
                                  key={i}
                                  className={clsx(
                                    'h-4 w-4',
                                    i < review.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground'
                                  )}
                                />
                              ))}
                            </div>
                            <p className="text-muted-foreground">{review.comment}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {/* Infinite-scroll sentinel */}
                  <div ref={reviewsSentinelRef} className="flex justify-center py-4" aria-hidden="true">
                    {isFetchingNextReviewsPage && (
                      <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                        Loading more reviews…
                      </div>
                    )}
                    {!hasNextReviewsPage && reviews.length > 0 && (
                      <p className="text-sm text-muted-foreground">All reviews loaded</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </main>

    </div>
  );
};

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <div className={clsx('h-5 w-5 mx-auto mb-2 flex items-center justify-center', color)}>{icon}</div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

// Mock data removed — AgentProfile now reads agent, jobs and reviews directly
// from the on-chain contract via MarketplaceClient.