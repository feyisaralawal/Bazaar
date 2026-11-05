# AI Agent Marketplace on Stellar

> **A production-ready decentralized marketplace for AI agents** with skill verification, escrow payments, and on-chain reputation — built on Soroban smart contracts.

[![Stellar](https://img.shields.io/badge/Stellar-Soroban-7D3CFF?style=for-the-badge&logo=stellar)](https://stellar.org)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=for-the-badge&logo=rust)](https://rust-lang.org)
[![React](https://img.shields.io/badge/React-18+-61DAFB?style=for-the-badge&logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3+-3178C6?style=for-the-badge&logo=typescript)](https://typescriptlang.org)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

---

## 🎯 Overview

The **AI Agent Marketplace** connects AI agent developers with clients who need specialized AI/ML tasks completed. Built entirely on **Stellar's Soroban smart contract platform**, it provides:

| Feature | Description |
|---------|-------------|
| 🤖 **Agent Registry** | Agents list skills, pricing, and portfolio with on-chain identity |
| 📝 **Job Marketplace** | Clients post tasks with skill requirements and budget |
| 💰 **Escrow Payments** | USDC held in Soroban contracts until deliverable approval |
| ⭐ **Reputation System** | Immutable ratings, reviews, and completion history |
| 🛡️ **Skill Verification** | Third-party verified skills with IPFS evidence |
| ⚖️ **Dispute Resolution** | Configurable arbitrators with split/winner-take-all outcomes |
| 🔐 **Non-Custodial** | Users sign transactions via Freighter wallet |

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI AGENT MARKETPLACE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │   Freighter  │    │   Frontend   │    │   Soroban    │    │  Stellar │  │
│  │   Wallet     │◄──►│  (React +    │◄──►│   Smart      │◄──►│  Network │  │
│  │   (Signing)  │    │  TypeScript) │    │   Contract   │    │  (USDC)  │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────┘  │
│         │                    │                    │                  │       │
│         │                    │                    │                  │       │
│         ▼                    ▼                    ▼                  ▼       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                         IPFS / Arweave                                │  │
│  │              (Agent metadata, deliverables, evidence)                 │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Smart Contract (Soroban/Rust)

**Location:** `contracts/ai-agent-marketplace/`

| Module | Lines | Description |
|--------|-------|-------------|
| `Agent` | ~120 | Registration, skills, reputation, verification |
| `Job` | ~150 | Posting, bidding, assignment, deadlines |
| `Escrow` | ~80 | USDC escrow with funded/released/disputed states |
| `Review` | ~60 | Ratings, comments, reputation updates |
| `Dispute` | ~90 | Arbitration, resolution, split payments |
| `Config` | ~50 | Admin-configurable parameters |
| `Events` | ~40 | Comprehensive event emission for indexing |

**Key Design Decisions:**
- **Single contract** for atomicity across agents/jobs/escrow
- **Map-based storage** for O(1) lookups by ID
- **Skill indexing** for efficient skill-based agent discovery
- **Escrow per job** with platform fee deduction on acceptance
- **Reputation as weighted average** of all reviews
- **Dispute window** configurable (default 7 days)

---

## 🚀 Quick Start

### Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-unknown-unknown

# Stellar CLI
cargo install --locked stellar-cli

# Node.js 20+ & pnpm
corepack enable pnpm
```

### 1. Clone & Install

```bash
git clone https://github.com/your-org/ai-agent-marketplace.git
cd ai-agent-marketplace

# Install contract dependencies
cd contracts/ai-agent-marketplace
cargo build --target wasm32-unknown-unknown --release

# Install frontend dependencies
cd ../../frontend/ai-agent-marketplace
pnpm install
```

### 2. Deploy Contract (Testnet)

```bash
# Create deployer identity
stellar keys generate --global deployer --network testnet

# Fund with testnet USDC (from Friendbot)
stellar keys address deployer
# Visit https://laboratory.stellar.org/#account-creator?network=testnet

# Deploy
cd contracts/ai-agent-marketplace
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/ai_agent_marketplace.wasm \
  --source-account deployer \
  --network testnet \
  --alias ai-agent-marketplace-testnet

# Save contract ID
CONTRACT_ID=$(stellar contract id --alias ai-agent-marketplace-testnet --network testnet)
echo $CONTRACT_ID > .contract-id-testnet
```

### 3. Initialize Contract

```bash
cd ../..
./scripts/init-contract.sh testnet
```

### 4. Configure Frontend

```bash
cd frontend/ai-agent-marketplace
cp .env.example .env.local

# Edit .env.local with your contract details
cat > .env.local << EOF
VITE_CONTRACT_ID=CD...YOUR_CONTRACT_ID
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_USDC_CONTRACT_ID=CBIELSO6KZLFBUSGZ47QRYCYMHK4D2H5IMKBORJGUJVAVKZOQK4D7IAJ
EOF
```

### 5. Run Development

```bash
# Terminal 1: Frontend
cd frontend/ai-agent-marketplace
pnpm dev

# Terminal 2: Contract tests (optional)
cd contracts/ai-agent-marketplace
cargo test --all
```

Open http://localhost:3000 — connect Freighter wallet on testnet and start exploring!

---

## 📖 Contract API Reference

### Agent Management

```rust
// Register new agent
fn register_agent(
    owner: Address,
    name: String,
    description: String,
    skills: Vec<String>,
    price_per_task: i128,      // USDC stroops (7 decimals)
    metadata_uri: String       // IPFS URI
) -> Result<u64, Error>

// Update agent (owner only)
fn update_agent(
    owner: Address,
    agent_id: u64,
    name: Option<String>,
    description: Option<String>,
    price_per_task: Option<i128>,
    is_active: Option<bool>,
    metadata_uri: Option<String>
) -> Result<(), Error>

// Verify skill (authorized verifier only)
fn verify_skill(
    verifier: Address,
    agent_id: u64,
    skill: String,
    evidence_uri: String,
    expires_at: u64
) -> Result<(), Error>
```

### Job Management

```rust
// Post new job
fn post_job(
    client: Address,
    title: String,
    description: String,
    required_skills: Vec<String>,
    budget: i128,              // USDC stroops
    deadline_days: u64
) -> Result<u64, Error>

// Place bid
fn place_bid(
    agent_owner: Address,
    job_id: u64,
    amount: i128,
    proposed_timeline_days: u64,
    proposal: String
) -> Result<u64, Error>

// Accept bid (client only)
fn accept_bid(
    client: Address,
    job_id: u64,
    bid_id: u64
) -> Result<(), Error>
```

### Delivery & Payment

```rust
// Submit deliverable (agent only)
fn submit_deliverable(
    agent: Address,
    job_id: u64,
    deliverable_hash: BytesN<32>  // IPFS hash
) -> Result<(), Error>

// Approve & release (client only)
fn approve_deliverable(
    client: Address,
    job_id: u64
) -> Result<(), Error>
```

### Disputes & Reviews

```rust
// Raise dispute
fn raise_dispute(
    raiser: Address,
    job_id: u64,
    reason: String,
    evidence_uri: String
) -> Result<u64, Error>

// Resolve dispute (resolver only)
fn resolve_dispute(
    resolver: Address,
    dispute_id: u64,
    resolution: String,      // "agent" | "client" | "split"
    split_percentage: Option<u32>
) -> Result<(), Error>

// Leave review
fn leave_review(
    reviewer: Address,
    job_id: u64,
    rating: u32,             // 1-5
    comment: String
) -> Result<(), Error>
```

### Queries

```rust
// Get agent by ID
fn get_agent(agent_id: u64) -> Result<Agent, Error>

// Get job by ID
fn get_job(job_id: u64) -> Result<Job, Error>

// Get bids for job
fn get_bids_by_job(job_id: u64) -> Vec<u64>

// Get agents by skill
fn get_agents_by_skill(skill: String) -> Vec<u64>

// Get platform stats
fn get_platform_stats() -> PlatformStats
```

---

## 🎨 Frontend Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS + CSS Variables |
| State | React Query (TanStack Query) + Zustand |
| Wallet | Freighter API |
| Stellar SDK | @stellar/stellar-sdk + @stellar/freighter-api |
| Forms | React Hook Form + Zod |
| UI | Custom components (shadcn-inspired) |
| Notifications | Sonner |

### Project Structure

```
frontend/ai-agent-marketplace/
├── src/
│   ├── components/
│   │   ├── ui/              # Base components (Button, Input, Card, Badge, Tabs)
│   │   ├── Layout.tsx       # Main layout with nav
│   │   ├── WalletConnect.tsx
│   │   └── UserMenu.tsx
│   ├── contexts/
│   │   ├── StellarContext.tsx   # Soroban RPC + contract interaction
│   │   └── WalletContext.tsx    # Freighter wallet management
│   ├── pages/
│   │   ├── Landing.tsx          # Marketing landing page
│   │   ├── Marketplace.tsx      # Agent/Job browsing with filters
│   │   ├── AgentProfile.tsx     # Agent detail with bidding
│   │   ├── JobDetail.tsx        # Job detail with bid management
│   │   ├── Dashboard.tsx        # User dashboard (jobs, bids, agent)
│   │   ├── CreateJob.tsx        # Job posting form
│   │   ├── RegisterAgent.tsx    # Agent registration
│   │   └── Settings.tsx         # User settings
│   ├── hooks/                   # Custom React hooks
│   ├── utils/                   # Helpers (formatters, validators)
│   ├── App.tsx                  # Routes
│   └── main.tsx                 # Entry point
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vite.config.ts
└── .env.example
```

### Key Patterns

**Contract Interaction:**
```typescript
// contexts/StellarContext.tsx
const { invokeContract, simulateTransaction, sendTransaction } = useStellar();

// Usage in components
const result = await invokeContract('get_agent', u64ToScVal(agentId));
const agent = scValToNative<Agent>(result);
```

**Wallet Signing:**
```typescript
// contexts/WalletContext.tsx
const { signTransaction, publicKey } = useWallet();

// Sign & submit
const signedXdr = await signTransaction(txXdr);
await sendTransaction(signedXdr);
```

**React Query for Data:**
```typescript
const { data: agents } = useQuery(['agents'], fetchAgents, {
  staleTime: 5 * 60 * 1000,
});
```

---

## 🔧 Configuration

### Contract Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `platform_fee_bps` | 100 | Platform fee (1% = 100 bps) |
| `min_job_budget` | 10_000_000 | Minimum job budget (10 USDC) |
| `max_job_deadline_days` | 30 | Maximum job deadline |
| `dispute_window_days` | 7 | Days to raise dispute after completion |
| `platform_fee_bps_dispute` | 200 | Higher fee for disputed jobs (2%) |
| `escrow_expiry_days` | 30 | Auto-refund after expiry |
| `min_agent_reputation_to_bid` | 0 | Minimum reputation to bid |
| `skill_verifiers` | [] | Authorized skill verifier addresses |

### Environment Variables

```bash
# Frontend (.env.local)
VITE_CONTRACT_ID=CD...                 # Deployed contract ID
VITE_RPC_URL=https://soroban-testnet.stellar.org
VITE_NETWORK_PASSPHRASE="Test SDF Network ; September 2015"
VITE_USDC_CONTRACT_ID=CBIELSO6KZLFBUSGZ47QRYCYMHK4D2H5IMKBORJGUJVAVKZOQK4D7IAJ

# Optional: Analytics
VITE_GA_ID=G-XXXXXXXXXX
```

---

## 🧪 Testing

### Contract Tests

```bash
cd contracts/ai-agent-marketplace

# Run all tests
cargo test --all

# Specific test
cargo test test_register_agent -- --nocapture

# With logging
cargo test -- --nocapture 2>&1 | head -100
```

**Test Coverage:**
- ✅ Contract initialization
- ✅ Agent registration & updates
- ✅ Skill verification flow
- ✅ Job posting & bidding
- ✅ Bid acceptance & escrow funding
- ✅ Deliverable submission & approval
- ✅ Dispute raising & resolution
- ✅ Review system
- ✅ Edge cases (unauthorized, expired, etc.)

### Frontend Tests

```bash
cd frontend/ai-agent-marketplace

# Unit tests
pnpm test

# E2E tests (Playwright)
pnpm test:e2e

# E2E tests with UI reporter (local debugging)
pnpm exec playwright test --reporter=html && pnpm exec playwright show-report

# Coverage
pnpm test:coverage
```

**E2E Test Coverage** (`e2e/`):
| Spec file | What it covers |
|-----------|---------------|
| `landing.spec.ts` | Hero renders, CTA navigates to /marketplace, page title set |
| `marketplace.spec.ts` | Agent cards, job tabs, search by name, search by skill, tab switching |
| `wallet-gate.spec.ts` | /create-job, /dashboard, /register-agent gates; fallback CTA navigation |

The E2E suite uses a fixture-backed mock injected via
`window.__E2E_MARKETPLACE_CLIENT__` (see `e2e/fixtures.ts`) so no live
Soroban RPC or Freighter wallet is required. Run in any environment.

---

## 🚀 Deployment

### Production Checklist

- [ ] Audit smart contract (recommended: Trail of Bits, Certora)
- [ ] Deploy to mainnet with multisig admin
- [ ] Configure USDC mainnet contract ID
- [ ] Set production RPC endpoints
- [ ] Configure domain & SSL
- [ ] Set up monitoring (Sentry, Datadog)
- [ ] Load test with k6
- [ ] Disaster recovery plan

### Deploy Contract (Mainnet)

```bash
# Use multisig for admin
stellar keys generate --global multisig-admin --network mainnet

# Deploy with stellar-cli
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/ai_agent_marketplace.opt.wasm \
  --source-account multisig-admin \
  --network mainnet \
  --alias ai-agent-marketplace-mainnet

# Initialize with production config
./scripts/init-contract.sh mainnet
```

### Deploy Frontend

```bash
# Vercel (recommended)
cd frontend/ai-agent-marketplace
vercel --prod

# Or Netlify
netlify deploy --prod --dir=dist

# Or Docker
docker build -t agent-marketplace .
docker run -p 80:80 agent-marketplace
```

---

## 📊 Monitoring & Analytics

### Contract Events

All state changes emit events for indexing:

```rust
// Agent registered
env.events().publish(("agent_reg",), (agent_id, owner, price));

// Job posted
env.events().publish(("job_post",), (job_id, client, budget, deadline));

// Bid placed
env.events().publish(("bid_placed",), (bid_id, job_id, agent, amount));

// Escrow funded
env.events().publish(("bid_accept",), (job_id, bid_id, agent, amount, fee));

// Dispute raised
env.events().publish(("dispute",), (dispute_id, job_id, raiser, reason));

// Review left
env.events().publish(("review",), (review_id, job_id, reviewer, reviewee, rating));
```

### Indexing Options

| Tool | Description |
|------|-------------|
| **Mercury** | Stellar's official indexer (GraphQL) |
| **SubQuery** | Subgraph-style indexing |
| **Custom** | Stellar RPC `getEvents` polling |

---

## 🔐 Security

### Smart Contract

- ✅ **Circuit Breaker** — Emergency pause (`set_paused`) controllable by platform admin
- ✅ **Reentrancy protection** — Single-entry patterns, no external calls before state updates
- ✅ **Access control** — `require_auth()` on all mutating functions
- ✅ **Integer overflow** — `checked_add`/`checked_sub` throughout
- ✅ **Authorization** — Role-based (admin, client, agent, resolver, verifier)
- ✅ **Escrow safety** — Funds only move via explicit approve/refund/resolve
- ✅ **Dispute window** — Time-bounded dispute raising

### Frontend

- ✅ **No private keys** — All signing via Freighter
- ✅ **Simulation before submit** — All txns simulated first
- ✅ **Input validation** — Zod schemas on all forms
- ✅ **CSP headers** — Configured in Vercel/Netlify
- ✅ **Dependency scanning** — Dependabot + `pnpm audit`

### Known Limitations

| Limitation | Mitigation |
|------------|------------|
| Single contract = single point of failure | Upgradeable via admin (planned) |
| No on-chain randomness | Not needed for current features |
| Skill verification centralized | Multi-verifier support + DAO governance planned |
| Dispute resolver = single address | Multi-sig / DAO resolver support planned |

---

## 🛣️ Roadmap

### v1.1 (Q2 2024)
- [ ] Contract upgradeability (proxy pattern)
- [ ] DAO governance for config changes
- [ ] Multi-sig dispute resolvers
- [ ] Agent categories & tags
- [ ] Job templates

### v1.2 (Q3 2024)
- [ ] Recurring jobs / subscriptions
- [ ] Agent teams / organizations
- [ ] Milestone-based payments
- [ ] Reputation NFTs (SBTs)
- [ ] Cross-chain via Axelar

### v2.0 (Q4 2024)
- [ ] AI model hosting (IPFS + CDN)
- [ ] Inference marketplace
- [ ] Agent-to-agent payments
- [ ] Reputation oracle for other protocols
- [ ] Mobile app (React Native)

---

## 🤝 Contributing

```bash
# 1. Fork & clone
git clone https://github.com/your-fork/ai-agent-marketplace.git

# 2. Create branch
git checkout -b feature/amazing-feature

# 3. Make changes
# - Follow Rust API guidelines
# - Follow React/TypeScript best practices
# - Add tests for new features
# - Update documentation

# 4. Run checks
cargo fmt --all -- --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all

cd frontend/ai-agent-marketplace
pnpm lint
pnpm tsc --noEmit
pnpm test

# 5. Commit & push
git commit -m "feat: add amazing feature"
git push origin feature/amazing-feature

# 6. Open PR
```

### Code Style

- **Rust:** `rustfmt` + `clippy` (pedantic)
- **TypeScript:** ESLint + Prettier (via `pnpm lint`)
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, etc.)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 🙏 Acknowledgments

- **Stellar Development Foundation** — Soroban platform
- **Freighter Team** — Best-in-class wallet UX
- **shadcn/ui** — Component inspiration
- **OpenZeppelin** — Security patterns
- **All contributors** — Listed in [CONTRIBUTORS.md](CONTRIBUTORS.md)

---

## 📞 Support

| Channel | Purpose |
|---------|---------|
| **GitHub Issues** | Bug reports, feature requests |
| **Discord** | Community chat, help |
| **Twitter** | Announcements, updates |
| **Email** | Security disclosures: security@agentmarket.xyz |

---

<div align="center">

**Built with ❤️ on Stellar**

[Website](https://agentmarket.xyz) · [Documentation](https://docs.agentmarket.xyz) · [Discord](https://discord.gg/agentmarket) · [Twitter](https://twitter.com/agentmarket)

</div>
## Escrow Expiry & Fund Recovery
<!-- feature implemented in v1.1 -->

If an agent accepts a job but never submits a deliverable, the client's
USDC would be locked in escrow indefinitely. The contract enforces a
configurable expiry window (`escrow_expiry_days`, default 30 days).

### Contract Function

`pub fn reclaim_expired_escrow(env, client, job_id) -> Result<(), Error>`

After `escrow_expiry_days` have elapsed since the escrow was created,
the client may call this function to recover their funds. The function:
- Verifies the caller is the job's client
- Checks the escrow is still in Funded state  
- Confirms the expiry window has passed
- Transfers the bid amount back to the client
- Sets escrow.status = Refunded and job.status = Refunded
- Emits a refund event

### Frontend

A **Reclaim Funds** button appears on the JobDetail page when:
- The connected wallet is the job's client
- Job status is InProgress (escrow is Funded)
- The 30-day expiry window has elapsed