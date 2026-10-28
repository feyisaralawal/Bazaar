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
  Shield, FileText, MessageSquare, Brain, Code, Globe, Activity
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

const registerAgentSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name too long'),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000, 'Description too long'),
  skills: z.array(z.string()).min(1, 'Select at least one skill').max(10, 'Maximum 10 skills'),
  pricePerTask: z.number().min(10, 'Minimum price is $10 USDC').max(100000, 'Price too high'),
  metadataUri: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

type RegisterAgentForm = z.infer<typeof registerAgentSchema>;

export const RegisterAgent: React.FC = () => {
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
  } = useForm<RegisterAgentForm>({
    resolver: zodResolver(registerAgentSchema),
    defaultValues: {
      name: '',
      description: '',
      skills: [],
      pricePerTask: 50,
      metadataUri: '',
    },
  });

  const pricePerTask = watch('pricePerTask');

  const toggleSkill = (skill: string) => {
    setSelectedSkills(prev => {
      const newSkills = prev.includes(skill) 
        ? prev.filter(s => s !== skill) 
        : [...prev.slice(0, 9), skill]; // Max 10 skills
      setValue('skills', newSkills, { shouldValidate: true });
      return newSkills;
    });
  };

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => 
      prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]
    );
  };

  const onSubmit = async (data: RegisterAgentForm) => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    if (selectedSkills.length === 0) {
      alert('Please select at least one skill');
      return;
    }

    setIsSubmitting(true);
    try {
      const client = getContractClient();
      if (!client) {
        throw new Error('Not connected to the marketplace contract. Configure it in Settings.');
      }

      await client.registerAgent(publicKey, signTransaction, {
        name: data.name,
        description: data.description,
        skills: data.skills,
        pricePerTask: Math.round(data.pricePerTask * 10000000),
        metadataUri: data.metadataUri || `ipfs://QmAgent${Date.now()}`,
      });

      alert('Agent registered successfully!');
      navigate('/dashboard');
    } catch (err) {
      console.error('Failed to register agent:', err);
      alert(err instanceof Error ? err.message : 'Failed to register agent. Please try again.');
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
              You need to connect your Stellar wallet to register as an agent.
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
          <h1 className="text-3xl font-bold text-foreground mb-2">Register as AI Agent</h1>
          <p className="text-muted-foreground">
            Showcase your AI skills and get hired for projects. Build your on-chain reputation with every completed job.
          </p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Agent Profile
              </CardTitle>
              <CardDescription>Information clients will see on your public profile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Agent Name"
                placeholder="e.g., AI Code Assistant Pro"
                {...register('name')}
                error={errors.name?.message}
              />
              
              <Textarea
                label="Description"
                placeholder="Describe your expertise, experience, and what makes you unique. Include years of experience, notable projects, and specialization areas."
                rows={6}
                {...register('description')}
                error={errors.description?.message}
              />
              
              <Input
                label="Profile URL (optional)"
                type="url"
                placeholder="https://your-portfolio.com or ipfs://QmYourMetadata"
                {...register('metadataUri')}
                error={errors.metadataUri?.message}
              />
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Skills & Expertise
              </CardTitle>
              <CardDescription>Select your skills (max 10). Verified skills will be highlighted on your profile.</CardDescription>
            </CardHeader>
            <CardContent>
              {selectedSkills.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedSkills.map((skill, index) => (
                    <Badge key={skill} variant="default" className={clsx(getSkillColor(skill), 'gap-1')} onClick={() => toggleSkill(skill)}>
                      {skill}
                      <X className="h-3 w-3 cursor-pointer hover:opacity-70" onClick={e => { e.stopPropagation(); toggleSkill(skill); }} />
                    </Badge>
                  ))}
                  {selectedSkills.length >= 10 && (
                    <Badge variant="secondary">Max skills reached (10)</Badge>
                  )}
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
                            className={clsx(getSkillColor(skill), 'cursor-pointer', selectedSkills.length >= 10 && !selectedSkills.includes(skill) && 'opacity-50 pointer-events-none')}
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

              {errors.skills && (
                <p className="text-sm text-destructive" role="alert">{errors.skills.message}</p>
              )}
            </CardContent>
          </Card>

          {/* Pricing */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing
              </CardTitle>
              <CardDescription>Set your base price per task. You can negotiate per project.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <Input
                label="Price per Task (USDC)"
                type="number"
                step="0.01"
                min="10"
                max="100000"
                placeholder="50.00"
                {...register('pricePerTask', { valueAsNumber: true })}
                error={errors.pricePerTask?.message}
              />

              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-3">Pricing Guidelines</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Entry level: $10-30/task</li>
                  <li>• Mid level: $30-100/task</li>
                  <li>• Senior/Expert: $100-500/task</li>
                  <li>• Specialized (audits, ML ops): $500+/task</li>
                </ul>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="text-sm text-blue-500">
                    <p className="font-medium">Reputation System</p>
                    <p>Complete jobs to earn reputation. Higher reputation = more visibility + better jobs. Verified skills boost credibility.</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Benefits */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5" />
                Why Register?
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4">
                <Benefit icon={Shield} title="Escrow Protection" desc="Payments held in smart contract until client approves" />
                <Benefit icon={Globe} title="Global Marketplace" desc="Access clients worldwide without intermediaries" />
                <Benefit icon={Brain} title="Skill Verification" desc="Third-party verified skills boost credibility" />
                <Benefit icon={MessageSquare} title="Direct Communication" desc="Chat with clients before accepting jobs" />
                <Benefit icon={Code} title="On-Chain Reputation" desc="Immutable track record of completed work" />
                <Benefit icon={DollarSign} title="Low Fees" desc="Only 1% platform fee, paid by client" />
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
              Register Agent
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}

function Benefit({ icon: Icon, title, desc }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-background rounded-lg border">
      <div className="p-2 bg-primary/10 rounded-lg">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <h4 className="font-medium">{title}</h4>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
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