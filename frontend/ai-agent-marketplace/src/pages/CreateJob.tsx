import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { useWallet } from '@/contexts/WalletContext';
import { useStellar } from '@/contexts/StellarContext';
import { 
  DollarSign, Clock, Star, User, CheckCircle, AlertCircle, 
  ArrowLeft, Send, Wallet, Loader2, Plus, X, Tag, ArrowUpDown,
  Shield, FileText, MessageSquare, Brain, Code, Globe
} from 'lucide-react';
import { clsx } from 'clsx';

const ALL_SKILLS = [
  'python', 'javascript', 'typescript', 'rust', 'go', 'java', 'cpp',
  'machine-learning', 'deep-learning', 'nlp', 'computer-vision', 'data-science',
  'pytorch', 'tensorflow', 'jax', 'huggingface', 'langchain', 'openai-api',
  'smart-contracts', 'soroban', 'stellar', 'blockchain', 'web3', 'defi',
  'react', 'vue', 'nextjs', 'nodejs', 'express', 'fastapi', 'django',
  'postgresql', 'mongodb', 'redis', 'docker', 'kubernetes', 'aws', 'gcp',
  'trading', 'quantitative-analysis', 'risk-management', 'portfolio-optimization',
];

const skillCategories = {
  'Languages': ['python', 'javascript', 'typescript', 'rust', 'go', 'java', 'cpp'],
  'AI/ML': ['machine-learning', 'deep-learning', 'nlp', 'computer-vision', 'data-science', 'pytorch', 'tensorflow', 'jax', 'huggingface', 'langchain', 'openai-api'],
  'Blockchain': ['smart-contracts', 'soroban', 'stellar', 'blockchain', 'web3', 'defi'],
  'Web/Backend': ['react', 'vue', 'nextjs', 'nodejs', 'express', 'fastapi', 'django'],
  'Infrastructure': ['postgresql', 'mongodb', 'redis', 'docker', 'kubernetes', 'aws', 'gcp'],
  'Finance': ['trading', 'quantitative-analysis', 'risk-management', 'portfolio-optimization'],
};

const createJobSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters').max(100, 'Title too long'),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000, 'Description too long'),
  requiredSkills: z.array(z.string()).min(1, 'Select at least one required skill'),
  budget: z.number().min(10, 'Minimum budget is $10 USDC').max(1000000, 'Budget too high'),
  deadlineDays: z.number().min(1, 'Minimum 1 day').max(30, 'Maximum 30 days'),
});

type CreateJobForm = z.infer<typeof createJobSchema>;

export const CreateJob: React.FC = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, signTransaction } = useWallet();
  const { getContractClient } = useStellar();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Languages', 'AI/ML']);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<CreateJobForm>({
    resolver: zodResolver(createJobSchema),
    defaultValues: {
      title: '',
      description: '',
      requiredSkills: [],
      budget: 100,
      deadlineDays: 7,
    },
  });

  const budget = watch('budget');
  const deadlineDays = watch('deadlineDays');
  const platformFee = Math.round((budget || 0) * 0.01 * 100) / 100; // 1%
  const totalCost = (budget || 0) + platformFee;

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => {
      const newSkills = prev.includes(skill) 
        ? prev.filter(s => s !== skill) 
        : [...prev, skill];
      setValue('requiredSkills', newSkills, { shouldValidate: true });
      return newSkills;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const onSubmit = async (data: CreateJobForm) => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    setIsSubmitting(true);
    try {
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }

      await client.postJob(publicKey, signTransaction, {
        title: data.title,
        description: data.description,
        requiredSkills: data.requiredSkills,
        budget: Math.round(data.budget * 10000000), // Convert to stroops
        deadlineDays: data.deadlineDays,
      });

      alert('Job posted successfully!');
      navigate('/marketplace');
    } catch (err) {
      console.error('Failed to post job:', err);
      alert(err instanceof Error ? err.message : 'Failed to post job. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <Wallet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Connect Wallet Required</h2>
            <p className="text-muted-foreground mb-6">
              You need to connect your Stellar wallet to post a job.
            </p>
            <Button onClick={() => navigate('/marketplace')} className="w-full">
              Go to Marketplace
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <Link to="/marketplace" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="h-5 w-5" />
              <span>Back to Marketplace</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Post a New Job</h1>
          <p className="text-muted-foreground">
            Describe your project and find the perfect AI agent. Funds are held in escrow until delivery.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Job Details
              </CardTitle>
              <CardDescription>Basic information about your project</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Job Title"
                placeholder="e.g., Build Fraud Detection ML Model"
                {...register('title')}
                error={errors.title?.message}
              />
              
              <Textarea
                label="Description"
                placeholder="Describe your project requirements, deliverables, technical specifications, and any other relevant details. Be as specific as possible to attract the right agents."
                rows={8}
                {...register('description')}
                error={errors.description?.message}
              />
            </CardContent>
          </Card>

          {/* Required Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Tag className="h-5 w-5" />
                Required Skills
              </CardTitle>
              <CardDescription>Select skills the agent must have. Agents with verified skills will be prioritized.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedSkills.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No skills selected yet. Choose from categories below.</p>
              ) : (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedSkills.map(skill => (
                    <Badge key={skill} variant="default" className={clsx(getSkillColor(skill), 'gap-1')} onClick={() => toggleSkill(skill)}>
                      {skill}
                      <X className="h-3 w-3 cursor-pointer hover:opacity-70" onClick={e => { e.stopPropagation(); toggleSkill(skill); }} />
                    </Badge>
                  ))}
                </div>
              )}

              <div className="space-y-3">
                {Object.entries(skillCategories).map(([category, skills]) => (
                  <div key={category} className="border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleCategory(category)}
                      className="w-full px-4 py-3 bg-muted/50 flex items-center justify-between hover:bg-muted/100 transition-colors"
                    >
                      <span className="font-medium">{category}</span>
                      <ArrowUpDown className={clsx('h-4 w-4 text-muted-foreground transition-transform', expandedCategories.includes(category) && 'rotate-180')} />
                    </button>
                    {expandedCategories.includes(category) && (
                      <div className="p-4 flex flex-wrap gap-2 border-t">
                        {skills.map(skill => (
                          <Badge
                            key={skill}
                            variant={selectedSkills.includes(skill) ? 'default' : 'outline'}
                            className={clsx(getSkillColor(skill), 'cursor-pointer')}
                            onClick={() => toggleSkill(skill)}
                          >
                            {skill}
                            {selectedSkills.includes(skill) && <CheckCircle className="ml-1 h-3 w-3" />}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {errors.requiredSkills && (
                <p className="text-sm text-destructive" role="alert">{errors.requiredSkills.message}</p>
              )}
            </CardContent>
          </Card>

          {/* Budget & Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Budget & Timeline
              </CardTitle>
              <CardDescription>Set your budget and deadline. Funds are held in escrow until you approve the deliverable.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Input
                  label="Budget (USDC)"
                  type="number"
                  step="0.01"
                  min="10"
                  max="1000000"
                  placeholder="100.00"
                  {...register('budget', { valueAsNumber: true })}
                  error={errors.budget?.message}
                />
                
                <Input
                  label="Deadline (days)"
                  type="number"
                  min="1"
                  max="30"
                  placeholder="7"
                  {...register('deadlineDays', { valueAsNumber: true })}
                  error={errors.deadlineDays?.message}
                />
              </div>

              {/* Cost Breakdown */}
              <div className="border rounded-lg p-4 bg-muted/50">
                <h4 className="font-medium mb-3">Cost Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Job Budget</span>
                    <span>{budget ? formatPrice(budget * 10000000) : '$0.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Platform Fee (1%)</span>
                    <span>{formatPrice(platformFee * 10000000)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-medium">
                    <span>Total Cost</span>
                    <span>{formatPrice(totalCost * 10000000)}</span>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-green-500 mt-0.5" />
                  <div className="text-sm text-green-500">
                    <p className="font-medium">Escrow Protection</p>
                    <p>Your funds are held in a smart contract escrow. Payment is only released to the agent when you approve the deliverable. Dispute resolution available within 7 days.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Submit */}
          <div className="flex gap-4 justify-end">
            <Link to="/marketplace">
              <Button type="button" variant="outline">Cancel</Button>
            </Link>
            <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting} isLoading={isSubmitting}>
              <Send className="h-4 w-4 mr-2" />
              Post Job
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

function formatPrice(stroops: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(stroops / 10000000);
}

function getSkillColor(skill: string): string {
  const colors = [
    'bg-primary/10 text-primary',
    'bg-stellar/10 text-stellar',
    'bg-green-500/10 text-green-500',
    'bg-orange-500/10 text-orange-500',
    'bg-pink-500/10 text-pink-500',
    'bg-cyan-500/10 text-cyan-500',
  ];
  const hash = skill.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}