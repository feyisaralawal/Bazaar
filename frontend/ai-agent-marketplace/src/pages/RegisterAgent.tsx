import React, { useRef, useState } from 'react';
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
  DollarSign, Star, CheckCircle,
  ArrowLeft, Send, Wallet, Loader2, X, ArrowUpDown,
  Shield, MessageSquare, Brain, Code, Globe, Activity,
  Upload, FileJson, ExternalLink, AlertCircle, RefreshCw,
} from 'lucide-react';
import { clsx } from 'clsx';
import {
  uploadJsonToIpfs,
  uploadToIpfs,
  cidToUri,
  ipfsUriToUrl,
  isIpfsConfigured,
  type UploadProgress,
} from '@/lib/ipfs';

// ── Skill data ────────────────────────────────────────────────────────────────

const skillCategories: Record<string, string[]> = {
  'Languages': ['python', 'javascript', 'typescript', 'rust', 'go', 'java', 'cpp'],
  'AI/ML': ['machine-learning', 'deep-learning', 'nlp', 'computer-vision', 'data-science', 'pytorch', 'tensorflow', 'jax', 'huggingface', 'langchain', 'openai-api'],
  'Blockchain': ['smart-contracts', 'soroban', 'stellar', 'blockchain', 'web3', 'defi'],
  'Web/Backend': ['react', 'vue', 'nextjs', 'nodejs', 'express', 'fastapi', 'django'],
  'Infrastructure': ['postgresql', 'mongodb', 'redis', 'docker', 'kubernetes', 'aws', 'gcp'],
  'Finance': ['trading', 'quantitative-analysis', 'risk-management', 'portfolio-optimization'],
};

// ── Zod schema ────────────────────────────────────────────────────────────────
//
// metadataUri accepts any non-empty string that starts with https:// or ipfs://
// (the standard z.string().url() validator rejects ipfs:// URIs).

const registerAgentSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters').max(50, 'Name too long'),
  description: z.string().min(50, 'Description must be at least 50 characters').max(5000, 'Description too long'),
  skills: z.array(z.string()).min(1, 'Select at least one skill').max(10, 'Maximum 10 skills'),
  pricePerTask: z.number().min(10, 'Minimum price is $10 USDC').max(100000, 'Price too high'),
  portfolioLinks: z.string().optional(),
  metadataUri: z
    .string()
    .optional()
    .refine(
      (v) => !v || v.startsWith('https://') || v.startsWith('ipfs://'),
      'Must start with https:// or ipfs://',
    ),
});

type RegisterAgentForm = z.infer<typeof registerAgentSchema>;

// ── Upload mode types ─────────────────────────────────────────────────────────

type UploadMode = 'json-editor' | 'file-upload' | 'manual-url';

export const RegisterAgent: React.FC = () => {
  const navigate = useNavigate();
  const { publicKey, isConnected, signTransaction } = useWallet();
  const { getContractClient } = useStellar();
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<string[]>(['Languages', 'AI/ML']);

  // ── IPFS state ──
  const [uploadMode, setUploadMode] = useState<UploadMode>('json-editor');
  const [ipfsProgress, setIpfsProgress] = useState<UploadProgress>({ percent: null, status: 'idle' });
  const [uploadedCid, setUploadedCid] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<RegisterAgentForm>({
    resolver: zodResolver(registerAgentSchema),
    defaultValues: {
      name: '',
      description: '',
      skills: [],
      pricePerTask: 50,
      portfolioLinks: '',
      metadataUri: '',
    },
  });

  const pricePerTask = watch('pricePerTask');
  const nameValue = watch('name');
  const descValue = watch('description');
  const metadataUriValue = watch('metadataUri');

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
    setExpandedCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );
  };

  // ── IPFS upload helpers ───────────────────────────────────────────────────

  /** Build a metadata JSON object from the current form values. */
  const buildMetadataJson = (): Record<string, unknown> => {
    const portfolioLinks = getValues('portfolioLinks') ?? '';
    return {
      name: getValues('name'),
      description: getValues('description'),
      skills: selectedSkills,
      pricePerTask: getValues('pricePerTask'),
      portfolioLinks: portfolioLinks
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean),
      createdAt: new Date().toISOString(),
      version: '1.0',
    };
  };

  const handleUploadJson = async () => {
    if (!isIpfsConfigured()) {
      alert('VITE_IPFS_API_KEY is not set. Add it to your .env.local file and restart the dev server.');
      return;
    }
    setIpfsProgress({ percent: null, status: 'uploading' });
    setUploadedCid(null);
    try {
      const metadata = buildMetadataJson();
      const cid = await uploadJsonToIpfs(metadata, 'agent-metadata.json', setIpfsProgress);
      setUploadedCid(cid);
      setValue('metadataUri', cidToUri(cid), { shouldValidate: true });
    } catch (err) {
      console.error('IPFS JSON upload failed:', err);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedFile) return;
    if (!isIpfsConfigured()) {
      alert('VITE_IPFS_API_KEY is not set. Add it to your .env.local file and restart the dev server.');
      return;
    }
    setIpfsProgress({ percent: null, status: 'uploading' });
    setUploadedCid(null);
    try {
      const cid = await uploadToIpfs(selectedFile, selectedFile.name, setIpfsProgress);
      setUploadedCid(cid);
      setValue('metadataUri', cidToUri(cid), { shouldValidate: true });
    } catch (err) {
      console.error('IPFS file upload failed:', err);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    setUploadedCid(null);
    setIpfsProgress({ percent: null, status: 'idle' });
  };

  const resetUpload = () => {
    setUploadedCid(null);
    setIpfsProgress({ percent: null, status: 'idle' });
    setSelectedFile(null);
    setValue('metadataUri', '', { shouldValidate: false });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── form submit ───────────────────────────────────────────────────────────

  const onSubmit = async (data: RegisterAgentForm) => {
    if (!publicKey) {
      alert('Please connect your wallet first');
      return;
    }

    if (selectedSkills.length === 0) {
      alert('Please select at least one skill');
      return;
    }

    // Resolve the final metadataUri
    let finalMetadataUri = data.metadataUri ?? '';
    if (!finalMetadataUri) {
      // No URI provided and no upload done — auto-generate a placeholder
      // (acceptable for testnet; production should always upload)
      finalMetadataUri = cidToUri(`QmAgent${Date.now()}`);
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
        pricePerTask: Math.round(data.pricePerTask * 10_000_000),
        metadataUri: finalMetadataUri,
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

  // ── derived IPFS UI state ────────────────────────────────────────────────
  const isUploading = ipfsProgress.status === 'uploading';
  const uploadDone = ipfsProgress.status === 'done' && !!uploadedCid;
  const uploadError = ipfsProgress.status === 'error';

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
                placeholder="Describe your expertise, experience, and what makes you unique. Include years of experience, notable projects, and specialisation areas."
                rows={6}
                {...register('description')}
                error={errors.description?.message}
              />
              
              <div>
                <label className="block text-sm font-medium mb-1">
                  Portfolio / External Links (optional)
                </label>
                <Textarea
                  placeholder={"https://github.com/yourhandle\nhttps://your-portfolio.com"}
                  rows={3}
                  {...register('portfolioLinks')}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  One URL per line. These are included in the metadata uploaded to IPFS.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* ── IPFS Metadata Upload ── */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileJson className="h-5 w-5" />
                Agent Metadata (IPFS)
              </CardTitle>
              <CardDescription>
                Upload your extended profile to IPFS. The returned CID is stored
                on-chain as <code className="text-xs bg-muted px-1 rounded">metadata_uri</code>.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">

              {/* Upload mode selector */}
              <div className="flex gap-2 flex-wrap">
                {([
                  { id: 'json-editor', label: 'Auto-build JSON', icon: FileJson },
                  { id: 'file-upload', label: 'Upload File',     icon: Upload },
                  { id: 'manual-url', label: 'Enter URL',        icon: Globe },
                ] as { id: UploadMode; label: string; icon: React.ComponentType<{ className?: string }> }[]).map(
                  ({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => { setUploadMode(id); resetUpload(); }}
                      className={clsx(
                        'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                        uploadMode === id
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background border-border text-muted-foreground hover:text-foreground',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ),
                )}
              </div>

              {/* ── JSON editor mode ── */}
              {uploadMode === 'json-editor' && (
                <div className="space-y-4">
                  <div className="p-4 bg-muted/50 rounded-lg border font-mono text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre">
                    {JSON.stringify(
                      {
                        name: nameValue || '<agent name>',
                        description: descValue
                          ? descValue.slice(0, 80) + (descValue.length > 80 ? '…' : '')
                          : '<description>',
                        skills: selectedSkills.length ? selectedSkills : ['<skill>'],
                        pricePerTask: pricePerTask,
                        portfolioLinks: (getValues('portfolioLinks') ?? '')
                          .split('\n')
                          .map((l) => l.trim())
                          .filter(Boolean),
                        createdAt: '<ISO timestamp>',
                        version: '1.0',
                      },
                      null,
                      2,
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    This JSON is built from the form fields above and uploaded to IPFS when you
                    click the button below.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleUploadJson}
                    disabled={isUploading || !nameValue || !descValue}
                    className="gap-2"
                    aria-label="Upload metadata JSON to IPFS"
                  >
                    {isUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {isUploading ? 'Uploading…' : 'Upload Metadata to IPFS'}
                  </Button>
                </div>
              )}

              {/* ── File upload mode ── */}
              {uploadMode === 'file-upload' && (
                <div className="space-y-4">
                  <div
                    className={clsx(
                      'border-2 border-dashed rounded-lg p-8 text-center transition-colors',
                      selectedFile
                        ? 'border-primary/50 bg-primary/5'
                        : 'border-border hover:border-primary/40',
                    )}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files[0];
                      if (f) {
                        setSelectedFile(f);
                        setUploadedCid(null);
                        setIpfsProgress({ percent: null, status: 'idle' });
                      }
                    }}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json,application/json,image/*"
                      className="hidden"
                      id="metadata-file-input"
                      onChange={handleFileChange}
                      aria-label="Select metadata file to upload to IPFS"
                    />
                    <label
                      htmlFor="metadata-file-input"
                      className="flex flex-col items-center gap-3 cursor-pointer"
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      {selectedFile ? (
                        <span className="font-medium">{selectedFile.name}</span>
                      ) : (
                        <>
                          <span className="font-medium">Drop a file or click to browse</span>
                          <span className="text-xs text-muted-foreground">
                            Accepts JSON, PNG, JPG, or any image format
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                  {selectedFile && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleUploadFile}
                      disabled={isUploading}
                      className="gap-2"
                      aria-label="Upload selected file to IPFS"
                    >
                      {isUploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {isUploading ? 'Uploading…' : `Upload "${selectedFile.name}" to IPFS`}
                    </Button>
                  )}
                </div>
              )}

              {/* ── Manual URL mode ── */}
              {uploadMode === 'manual-url' && (
                <Input
                  label="Metadata URI"
                  type="text"
                  placeholder="https://your-portfolio.com or ipfs://Qm…"
                  {...register('metadataUri')}
                  error={errors.metadataUri?.message}
                />
              )}

              {/* ── Upload progress / result ── */}
              {isUploading && (
                <div className="flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-primary">Uploading to IPFS…</p>
                    {ipfsProgress.percent !== null && (
                      <div className="mt-1 h-1.5 bg-primary/20 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${ipfsProgress.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {uploadDone && uploadedCid && (
                <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    <span className="text-sm font-medium text-green-500">
                      Uploaded successfully
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">CID (Content Identifier):</p>
                    <code className="text-xs break-all font-mono bg-muted px-2 py-1 rounded block">
                      {uploadedCid}
                    </code>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">
                      On-chain <code className="bg-muted px-1 rounded">metadata_uri</code>:
                    </p>
                    <code className="text-xs break-all font-mono bg-muted px-2 py-1 rounded block">
                      {metadataUriValue}
                    </code>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <a
                      href={ipfsUriToUrl(metadataUriValue ?? '')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View on IPFS gateway
                    </a>
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Re-upload
                    </button>
                  </div>
                </div>
              )}

              {uploadError && (
                <div className="flex items-start gap-3 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-destructive">Upload failed</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{ipfsProgress.error}</p>
                    <button
                      type="button"
                      onClick={resetUpload}
                      className="text-xs text-primary mt-1 hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              )}

              {!isIpfsConfigured() && uploadMode !== 'manual-url' && (
                <div className="flex items-start gap-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-orange-500">IPFS not configured</p>
                    <p className="text-muted-foreground text-xs mt-0.5">
                      Set <code className="bg-muted px-1 rounded">VITE_IPFS_API_KEY</code> in your{' '}
                      <code className="bg-muted px-1 rounded">.env.local</code> file to enable
                      uploads. See{' '}
                      <code className="bg-muted px-1 rounded">.env.example</code> for details.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Skills */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Skills &amp; Expertise
              </CardTitle>
              <CardDescription>
                Select your skills (max 10). Verified skills will be highlighted on your profile.
              </CardDescription>
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
              <CardDescription>
                Set your base price per task. You can negotiate per project.
              </CardDescription>
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
                  <li>• Entry level: $10–30/task</li>
                  <li>• Mid level: $30–100/task</li>
                  <li>• Senior/Expert: $100–500/task</li>
                  <li>• Specialised (audits, ML ops): $500+/task</li>
                </ul>
              </div>

              <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div className="text-sm text-blue-500">
                    <p className="font-medium">Reputation System</p>
                    <p>
                      Complete jobs to earn reputation. Higher reputation = more visibility + better
                      jobs. Verified skills boost credibility.
                    </p>
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
            <Button
              type="submit"
              className="w-full md:w-auto"
              disabled={isSubmitting || isUploading}
              isLoading={isSubmitting}
            >
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