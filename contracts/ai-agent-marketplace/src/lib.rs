//! AI Agent Marketplace - Soroban Smart Contract
//! 
//! A decentralized marketplace for AI agents with:
//! - Agent registration with skill verification
// - Job posting and bidding system
// - Escrow payments with Stellar USDC
// - Reputation and review system
// - Dispute resolution

#![no_std]
use soroban_sdk::{
    auth::Context,
    contract, contracterror, contractimpl, contracttype, symbol_short,
    Address, Bytes, BytesN, Env, Map, String, Symbol, Vec, IntoVal,
    token::TokenClient,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Agent {
    pub id: u64,
    pub owner: Address,
    pub name: String,
    pub description: String,
    pub skills: Vec<String>,
    pub price_per_task: i128, // Price in USDC (7 decimals)
    pub reputation: u32,
    pub total_jobs_completed: u32,
    pub total_earnings: i128,
    pub is_active: bool,
    pub created_at: u64,
    pub skills_verified: Map<String, bool>,
    pub metadata_uri: String, // IPFS URI for agent details
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Job {
    pub id: u64,
    pub client: Address,
    pub title: String,
    pub description: String,
    pub required_skills: Vec<String>,
    pub budget: i128, // Budget in USDC (7 decimals)
    pub deadline: u64,
    pub status: JobStatus,
    pub assigned_agent: Option<Address>,
    pub bids: Vec<Bid>,
    pub escrow_amount: i128,
    pub created_at: u64,
    pub completed_at: Option<u64>,
    pub deliverable_hash: Option<BytesN<32>>,
    pub dispute_raised: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum JobStatus {
    Open,
    InProgress,
    Completed,
    Disputed,
    Cancelled,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Bid {
    pub agent: Address,
    pub agent_id: u64,
    pub amount: i128,
    pub proposed_timeline: u64,
    pub proposal: String,
    pub submitted_at: u64,
    pub status: BidStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BidStatus {
    Pending,
    Accepted,
    Rejected,
    Withdrawn,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Escrow {
    pub job_id: u64,
    pub client: Address,
    pub agent: Address,
    pub amount: i128,
    pub token: Address, // USDC token contract
    pub status: EscrowStatus,
    pub created_at: u64,
    pub released_at: Option<u64>,
    pub dispute_raised_at: Option<u64>,
    pub resolver: Option<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscrowStatus {
    Funded,
    Released,
    Disputed,
    Refunded,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Review {
    pub id: u64,
    pub job_id: u64,
    pub reviewer: Address, // Client or Agent
    pub reviewee: Address, // Agent or Client
    pub rating: u32, // 1-5
    pub comment: String,
    pub created_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SkillVerification {
    pub skill: String,
    pub verified_by: Address, // Verifier address (auditor/DAO)
    pub verified_at: u64,
    pub evidence_uri: String, // IPFS hash of proof
    pub expires_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub id: u64,
    pub job_id: u64,
    pub raised_by: Address,
    pub reason: String,
    pub evidence_uri: String,
    pub status: DisputeStatus,
    pub resolver: Option<Address>,
    pub resolution: Option<String>,
    pub created_at: u64,
    pub resolved_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeStatus {
    Open,
    UnderReview,
    Resolved,
    Escalated,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Config {
    pub admin: Address,
    pub usdc_token: Address,
    pub platform_fee_bps: u32, // Basis points (100 = 1%)
    pub min_job_budget: i128,
    pub max_job_deadline_days: u64,
    pub dispute_window_days: u64,
    pub min_agent_reputation: u32,
    pub platform_fee_recipient: Address,
    pub dispute_resolver: Address, // DAO or multisig
    pub min_agent_reputation_to_bid: u32,
    pub platform_fee_bps_dispute: u32, // Higher fee for disputes
    pub escrow_expiry_days: u64,
    pub skill_verifiers: Vec<Address>,
    /// When `true`, every required skill on a job must be verified on the
    /// bidding agent before the bid is accepted.  When `false`, unverified
    /// agents may bid freely; skills are treated as self-attested and the
    /// `skills_verified` map is purely informational.
    ///
    /// Default for new deployments should be `false` so that new agents are
    /// not blocked from the marketplace before a verifier network exists.
    pub require_skill_verification: bool,
}

#[contracttype]
pub enum DataKey {
    Config,
    AgentCounter,
    JobCounter,
    BidCounter,
    ReviewCounter,
    DisputeCounter,
    EscrowCounter,
    VerificationCounter,
    Agent(u64),
    AgentByOwner(Address),
    Job(u64),
    JobsByClient(Address),
    JobsByAgent(Address),
    Bid(u64),
    BidsByJob(u64),
    BidsByAgent(Address),
    Escrow(u64),
    EscrowByJob(u64),
    Review(u64),
    ReviewsByReviewee(Address),
    Dispute(u64),
    DisputesByJob(u64),
    SkillVerification(u64),
    SkillVerificationsByAgent(Address),
    AgentSkills(u64),
    SkillAgents(String),
    PlatformStats,
    IsPaused,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PlatformStats {
    pub total_agents: u64,
    pub total_jobs: u64,
    pub total_volume: i128,
    pub total_fees_collected: i128,
    pub total_disputes: u64,
    pub avg_job_completion_time: u64,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    NotInitialized = 1,
    AlreadyInitialized = 2,
    Unauthorized = 3,
    AgentNotFound = 4,
    AgentAlreadyExists = 5,
    AgentNotActive = 6,
    JobNotFound = 7,
    JobNotOpen = 8,
    JobNotInProgress = 9,
    JobNotCompleted = 10,
    JobAlreadyAssigned = 11,
    InsufficientBudget = 12,
    BidNotFound = 13,
    BidNotPending = 14,
    BidAlreadyExists = 15,
    InsufficientBidAmount = 16,
    BidTooLow = 17,
    AgentReputationTooLow = 18,
    InsufficientSkills = 19,
    SkillNotVerified = 20,
    /// Returned by `place_bid` when `config.require_skill_verification = true`
    /// and the bidding agent has not had the required skill verified by an
    /// authorized verifier.  Distinct from `SkillNotVerified` (which is kept
    /// for backward-compatibility) so callers can tell the difference between
    /// "skill not in agent's list" vs. "skill present but unverified while
    /// enforcement is enabled".
    SkillVerificationRequired = 52,
    EscrowNotFound = 21,
    EscrowNotFunded = 22,
    EscrowAlreadyReleased = 23,
    EscrowNotDisputed = 24,
    InsufficientEscrowBalance = 25,
    InvalidDeadline = 26,
    InvalidBudget = 27,
    InvalidRating = 28,
    ReviewNotFound = 29,
    AlreadyReviewed = 30,
    DisputeNotFound = 31,
    DisputeNotOpen = 32,
    DisputeWindowExpired = 33,
    UnauthorizedResolver = 34,
    InvalidToken = 35,
    InsufficientBalance = 36,
    TransferFailed = 37,
    EscrowExpired = 38,
    JobExpired = 39,
    InvalidSkill = 40,
    SkillAlreadyVerified = 41,
    VerifierNotAuthorized = 42,
    VerificationExpired = 43,
    PlatformNotInitialized = 44,
    InvalidConfig = 45,
    JobCancelled = 46,
    AlreadyDisputed = 47,
    DisputeResolved = 48,
    EscrowAlreadyRefunded = 49,
    InvalidDisputeEvidence = 50,
    ContractPaused = 51,
}

#[contract]
pub struct AiAgentMarketplace;

#[contractimpl]
impl AiAgentMarketplace {
    /// Initialize the marketplace contract
    pub fn initialize(
        env: Env,
        admin: Address,
        usdc_token: Address,
        platform_fee_bps: u32,
        min_job_budget: i128,
        max_job_deadline_days: u64,
        dispute_window_days: u64,
        min_agent_reputation: u32,
        platform_fee_recipient: Address,
        dispute_resolver: Address,
        min_agent_reputation_to_bid: u32,
        platform_fee_bps_dispute: u32,
        escrow_expiry_days: u64,
        skill_verifiers: Vec<Address>,
        require_skill_verification: bool,
    ) -> Result<(), Error> {
        if Self::has_config(&env) {
            return Err(Error::AlreadyInitialized);
        }

        if platform_fee_bps > 10000 {
            return Err(Error::InvalidConfig);
        }

        let config = Config {
            admin: admin.clone(),
            usdc_token: usdc_token.clone(),
            platform_fee_bps,
            min_job_budget,
            max_job_deadline_days,
            dispute_window_days,
            min_agent_reputation,
            platform_fee_recipient: platform_fee_recipient.clone(),
            dispute_resolver: dispute_resolver.clone(),
            min_agent_reputation_to_bid,
            platform_fee_bps_dispute,
            escrow_expiry_days,
            skill_verifiers,
            require_skill_verification,
        };

        env.storage().instance().set(&DataKey::Config, &config);
        env.storage().instance().set(&DataKey::AgentCounter, &0u64);
        env.storage().instance().set(&DataKey::JobCounter, &0u64);
        env.storage().instance().set(&DataKey::BidCounter, &0u64);
        env.storage().instance().set(&DataKey::ReviewCounter, &0u64);
        env.storage().instance().set(&DataKey::DisputeCounter, &0u64);
        env.storage().instance().set(&DataKey::EscrowCounter, &0u64);
        env.storage().instance().set(&DataKey::VerificationCounter, &0u64);

        let stats = PlatformStats {
            total_agents: 0,
            total_jobs: 0,
            total_volume: 0,
            total_fees_collected: 0,
            total_disputes: 0,
            avg_job_completion_time: 0,
        };
        env.storage().instance().set(&DataKey::PlatformStats, &stats);
        env.storage().instance().set(&DataKey::IsPaused, &false);

        // Emit initialization event
        env.events().publish(
            (symbol_short!("init"),),
            (admin, usdc_token, platform_fee_bps),
        );

        Ok(())
    }


    /// Admin function to pause or unpause contract operations
    pub fn set_paused(env: Env, admin: Address, paused: bool) -> Result<(), Error> {
        admin.require_auth();
        let config = Self::get_config(&env)?;
        if admin != config.admin {
            return Err(Error::Unauthorized);
        }

        env.storage().instance().set(&DataKey::IsPaused, &paused);
        env.events().publish(
            (symbol_short!("pause"),),
            (admin, paused),
        );
        Ok(())
    }

    /// Check if contract is paused
    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::IsPaused).unwrap_or(false)
    }

    /// Register a new AI agent
    pub fn register_agent(
        env: Env,
        owner: Address,
        name: String,
        description: String,
        skills: Vec<String>,
        price_per_task: i128,
        metadata_uri: String,
    ) -> Result<u64, Error> {
        owner.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        if price_per_task < config.min_job_budget {
            return Err(Error::InvalidBudget);
        }

        // Check if owner already has an agent
        let existing_agent_id: Option<u64> = env.storage().instance().get(&DataKey::AgentByOwner(owner.clone()));
        if existing_agent_id.is_some() {
            return Err(Error::AgentAlreadyExists);
        }

        let agent_id = Self::next_agent_id(&env)?;
        let now = env.ledger().timestamp();

        let agent = Agent {
            id: agent_id,
            owner: owner.clone(),
            name,
            description,
            skills: skills.clone(),
            price_per_task,
            reputation: 0,
            total_jobs_completed: 0,
            total_earnings: 0,
            is_active: true,
            created_at: now,
            skills_verified: Map::new(&env),
            metadata_uri,
        };

        // Store agent
        env.storage().instance().set(&DataKey::Agent(agent_id), &agent);
        env.storage().instance().set(&DataKey::AgentByOwner(owner.clone()), &agent_id);

        // Index skills
        for skill in skills.iter() {
            let mut skill_agents: Vec<u64> = env.storage().instance()
                .get(&DataKey::SkillAgents(skill.clone()))
                .unwrap_or(Vec::new(&env));
            skill_agents.push_back(agent_id);
            env.storage().instance().set(&DataKey::SkillAgents(skill.clone()), &skill_agents);
        }

        // Update stats
        let mut stats = Self::get_platform_stats(&env)?;
        stats.total_agents += 1;
        env.storage().instance().set(&DataKey::PlatformStats, &stats);

        env.events().publish(
            (symbol_short!("agent_reg"),),
            (agent_id, owner, agent.price_per_task),
        );

        Ok(agent_id)
    }

    /// Update agent details
    pub fn update_agent(
        env: Env,
        owner: Address,
        agent_id: u64,
        name: Option<String>,
        description: Option<String>,
        price_per_task: Option<i128>,
        is_active: Option<bool>,
        metadata_uri: Option<String>,
    ) -> Result<(), Error> {
        owner.require_auth();
        Self::ensure_not_paused(&env)?;

        let mut agent = Self::get_agent(&env, agent_id)?;
        if agent.owner != owner {
            return Err(Error::Unauthorized);
        }

        if let Some(name) = name {
            agent.name = name;
        }
        if let Some(description) = description {
            agent.description = description;
        }
        if let Some(price) = price_per_task {
            let config = Self::get_config(&env)?;
            if price < config.min_job_budget {
                return Err(Error::InvalidBudget);
            }
            agent.price_per_task = price;
        }
        if let Some(active) = is_active {
            agent.is_active = active;
        }
        if let Some(uri) = metadata_uri {
            agent.metadata_uri = uri;
        }

        env.storage().instance().set(&DataKey::Agent(agent_id), &agent);

        env.events().publish(
            (symbol_short!("agent_upd"),),
            (agent_id, owner),
        );

        Ok(())
    }

    /// Verify an agent's skill (called by authorized verifier)
    pub fn verify_skill(
        env: Env,
        verifier: Address,
        agent_id: u64,
        skill: String,
        evidence_uri: String,
        expires_at: u64,
    ) -> Result<(), Error> {
        verifier.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        if !config.skill_verifiers.contains(&verifier) {
            return Err(Error::VerifierNotAuthorized);
        }

        let mut agent = Self::get_agent(&env, agent_id)?;
        if !agent.skills.contains(&skill) {
            return Err(Error::InvalidSkill);
        }

        if agent.skills_verified.get(skill.clone()).unwrap_or(false) {
            return Err(Error::SkillAlreadyVerified);
        }

        let now = env.ledger().timestamp();
        if expires_at <= now {
            return Err(Error::InvalidDeadline);
        }

        let verification = SkillVerification {
            skill: skill.clone(),
            verified_by: verifier.clone(),
            verified_at: now,
            evidence_uri,
            expires_at,
        };

        let verification_id = Self::next_verification_id(&env)?;
        env.storage().instance().set(&DataKey::SkillVerification(verification_id), &verification);

        // Update agent's verified skills
        agent.skills_verified.set(skill.clone(), true);
        env.storage().instance().set(&DataKey::Agent(agent_id), &agent);

        // Index verification
        let mut agent_verifications: Vec<u64> = env.storage().instance()
            .get(&DataKey::SkillVerificationsByAgent(agent.owner.clone()))
            .unwrap_or(Vec::new(&env));
        agent_verifications.push_back(verification_id);
        env.storage().instance().set(&DataKey::SkillVerificationsByAgent(agent.owner.clone()), &agent_verifications);

        env.events().publish(
            (symbol_short!("skill_ver"),),
            (agent_id, skill, verifier, expires_at),
        );

        Ok(())
    }

    /// Post a new job
    pub fn post_job(
        env: Env,
        client: Address,
        title: String,
        description: String,
        required_skills: Vec<String>,
        budget: i128,
        deadline_days: u64,
    ) -> Result<u64, Error> {
        client.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        
        if budget < config.min_job_budget {
            return Err(Error::InsufficientBudget);
        }

        if deadline_days > config.max_job_deadline_days || deadline_days == 0 {
            return Err(Error::InvalidDeadline);
        }

        let job_id = Self::next_job_id(&env)?;
        let now = env.ledger().timestamp();
        let deadline = now + (deadline_days * 86400); // Convert days to seconds

        let job = Job {
            id: job_id,
            client: client.clone(),
            title,
            description,
            required_skills: required_skills.clone(),
            budget,
            deadline,
            status: JobStatus::Open,
            assigned_agent: None,
            bids: Vec::new(&env),
            escrow_amount: 0,
            created_at: now,
            completed_at: None,
            deliverable_hash: None,
            dispute_raised: false,
        };

        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Index job by client
        let mut client_jobs: Vec<u64> = env.storage().instance()
            .get(&DataKey::JobsByClient(client.clone()))
            .unwrap_or(Vec::new(&env));
        client_jobs.push_back(job_id);
        env.storage().instance().set(&DataKey::JobsByClient(client.clone()), &client_jobs);

        // Update stats
        let mut stats = Self::get_platform_stats(&env)?;
        stats.total_jobs += 1;
        env.storage().instance().set(&DataKey::PlatformStats, &stats);

        env.events().publish(
            (symbol_short!("job_post"),),
            (job_id, client, budget, deadline),
        );

        Ok(job_id)
    }

    /// Cancel an open job (client only)
    pub fn cancel_job(env: Env, client: Address, job_id: u64) -> Result<(), Error> {
        client.require_auth();
        Self::ensure_not_paused(&env)?;

        let mut job = Self::get_job(&env, job_id)?;
        if job.client != client {
            return Err(Error::Unauthorized);
        }
        if job.status != JobStatus::Open {
            return Err(Error::JobNotOpen);
        }

        job.status = JobStatus::Cancelled;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        env.events().publish(
            (symbol_short!("job_cancel"),),
            (job_id, client),
        );

        Ok(())
    }

    /// Place a bid on a job
    pub fn place_bid(
        env: Env,
        agent_owner: Address,
        job_id: u64,
        amount: i128,
        proposed_timeline_days: u64,
        proposal: String,
    ) -> Result<u64, Error> {
        agent_owner.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        let job = Self::get_job(&env, job_id)?;

        if job.status != JobStatus::Open {
            return Err(Error::JobNotOpen);
        }

        if env.ledger().timestamp() > job.deadline {
            return Err(Error::JobExpired);
        }

        // Check if agent exists and is active
        let agent_id: u64 = env.storage().instance()
            .get(&DataKey::AgentByOwner(agent_owner.clone()))
            .ok_or(Error::AgentNotFound)?;
        let agent = Self::get_agent(&env, agent_id)?;

        if !agent.is_active {
            return Err(Error::AgentNotActive);
        }

        if agent.reputation < config.min_agent_reputation_to_bid {
            return Err(Error::AgentReputationTooLow);
        }

        // Check if agent has required skills
        for required_skill in job.required_skills.iter() {
            if !agent.skills.contains(&required_skill) {
                return Err(Error::InsufficientSkills);
            }
            // Enforce skill verification only when the platform operator has
            // enabled hard verification mode.  When disabled, unverified agents
            // may bid; the `skills_verified` map is still shown on the agent
            // profile as a trust signal but does not gate participation.
            if config.require_skill_verification
                && !agent.skills_verified.get(required_skill.clone()).unwrap_or(false)
            {
                return Err(Error::SkillVerificationRequired);
            }
        }

        // Check if agent already bid
        let existing_bids: Vec<u64> = env.storage().instance()
            .get(&DataKey::BidsByJob(job_id))
            .unwrap_or(Vec::new(&env));
        for bid_id in existing_bids.iter() {
            let bid = Self::get_bid(&env, bid_id)?;
            if bid.agent == agent_owner {
                return Err(Error::BidAlreadyExists);
            }
        }

        // Check bid amount
        if amount < job.budget / 2 {
            // Minimum 50% of budget
            return Err(Error::BidTooLow);
        }

        if amount > job.budget {
            return Err(Error::InsufficientBidAmount);
        }

        let bid_id = Self::next_bid_id(&env)?;
        let now = env.ledger().timestamp();

        let bid = Bid {
            agent: agent_owner.clone(),
            agent_id,
            amount,
            proposed_timeline: now + (proposed_timeline_days * 86400),
            proposal,
            submitted_at: now,
            status: BidStatus::Pending,
        };

        env.storage().instance().set(&DataKey::Bid(bid_id), &bid);

        // Index bid
        let mut job_bids = existing_bids;
        job_bids.push_back(bid_id);
        env.storage().instance().set(&DataKey::BidsByJob(job_id), &job_bids);

        let mut agent_bids: Vec<u64> = env.storage().instance()
            .get(&DataKey::BidsByAgent(agent_owner.clone()))
            .unwrap_or(Vec::new(&env));
        agent_bids.push_back(bid_id);
        env.storage().instance().set(&DataKey::BidsByAgent(agent_owner.clone()), &agent_bids);

        env.events().publish(
            (symbol_short!("bid_placed"),),
            (bid_id, job_id, agent_owner, amount),
        );

        Ok(bid_id)
    }

    /// Withdraw a pending bid (agent only)
    pub fn withdraw_bid(
        env: Env,
        agent_owner: Address,
        job_id: u64,
        bid_id: u64,
    ) -> Result<(), Error> {
        agent_owner.require_auth();
        Self::ensure_not_paused(&env)?;

        let job = Self::get_job(&env, job_id)?;
        if job.status != JobStatus::Open {
            return Err(Error::JobNotOpen);
        }

        let mut bid = Self::get_bid(&env, bid_id)?;
        if bid.agent != agent_owner {
            return Err(Error::Unauthorized);
        }
        if bid.status != BidStatus::Pending {
            return Err(Error::BidNotPending);
        }

        // Verify bid belongs to this job
        let job_bids: Vec<u64> = env.storage().instance()
            .get(&DataKey::BidsByJob(job_id))
            .unwrap_or(Vec::new(&env));
        if !job_bids.contains(&bid_id) {
            return Err(Error::BidNotFound);
        }

        bid.status = BidStatus::Withdrawn;
        env.storage().instance().set(&DataKey::Bid(bid_id), &bid);

        env.events().publish(
            (symbol_short!("bid_withdraw"),),
            (bid_id, job_id, agent_owner),
        );

        Ok(())
    }

    /// Accept a bid and create escrow
    pub fn accept_bid(
        env: Env,
        client: Address,
        job_id: u64,
        bid_id: u64,
    ) -> Result<(), Error> {
        client.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        let mut job = Self::get_job(&env, job_id)?;

        if job.client != client {
            return Err(Error::Unauthorized);
        }

        if job.status != JobStatus::Open {
            return Err(Error::JobNotOpen);
        }

        let mut bid = Self::get_bid(&env, bid_id)?;

        if bid.status != BidStatus::Pending {
            return Err(Error::BidNotPending);
        }

        // Verify bid belongs to this job
        let job_bids: Vec<u64> = env.storage().instance()
            .get(&DataKey::BidsByJob(job_id))
            .unwrap_or(Vec::new(&env));
        if !job_bids.contains(&bid_id) {
            return Err(Error::BidNotFound);
        }

        // Calculate platform fee
        let platform_fee = (bid.amount * config.platform_fee_bps as i128) / 10000;
        let escrow_amount = bid.amount + platform_fee;

        // Transfer USDC from client to escrow
        let usdc_client = TokenClient::new(&env, &config.usdc_token);
        usdc_client.transfer(&client, &env.current_contract_address(), &escrow_amount);

        // Create escrow
        let escrow_id = Self::next_escrow_id(&env)?;
        let now = env.ledger().timestamp();

        let escrow = Escrow {
            job_id,
            client: client.clone(),
            agent: bid.agent.clone(),
            amount: bid.amount,
            token: config.usdc_token.clone(),
            status: EscrowStatus::Funded,
            created_at: now,
            released_at: None,
            dispute_raised_at: None,
            resolver: None,
        };

        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);
        // EscrowByJob maps job_id -> escrow_id, created atomically in accept_bid.
        // This guarantees the lookup succeeds for any job that has ever had a funded escrow.
        env.storage().instance().set(&DataKey::EscrowByJob(job_id), &escrow_id);

        // Update job
        job.status = JobStatus::InProgress;
        job.assigned_agent = Some(bid.agent.clone());
        job.escrow_amount = escrow_amount;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Update bid status
        bid.status = BidStatus::Accepted;
        env.storage().instance().set(&DataKey::Bid(bid_id), &bid);

        // Reject other bids
        for other_bid_id in job_bids.iter() {
            if *other_bid_id != bid_id {
                let mut other_bid = Self::get_bid(&env, other_bid_id)?;
                other_bid.status = BidStatus::Rejected;
                env.storage().instance().set(&DataKey::Bid(other_bid_id), &other_bid);
            }
        }

        // Index job by agent
        let mut agent_jobs: Vec<u64> = env.storage().instance()
            .get(&DataKey::JobsByAgent(bid.agent.clone()))
            .unwrap_or(Vec::new(&env));
        agent_jobs.push_back(job_id);
        env.storage().instance().set(&DataKey::JobsByAgent(bid.agent.clone()), &agent_jobs);

        // Update stats
        let mut stats = Self::get_platform_stats(&env)?;
        stats.total_volume += bid.amount;
        stats.total_fees_collected += platform_fee;
        env.storage().instance().set(&DataKey::PlatformStats, &stats);

        // Transfer platform fee to recipient
        usdc_client.transfer(
            &env.current_contract_address(),
            &config.platform_fee_recipient,
            &platform_fee,
        );

        env.events().publish(
            (symbol_short!("bid_accept"),),
            (job_id, bid_id, bid.agent, bid.amount, platform_fee),
        );

        Ok(())
    }

    /// Submit work deliverable
    pub fn submit_deliverable(
        env: Env,
        agent: Address,
        job_id: u64,
        deliverable_hash: BytesN<32>,
    ) -> Result<(), Error> {
        agent.require_auth();
        Self::ensure_not_paused(&env)?;

        let mut job = Self::get_job(&env, job_id)?;

        if job.assigned_agent != Some(agent.clone()) {
            return Err(Error::Unauthorized);
        }

        if job.status != JobStatus::InProgress {
            return Err(Error::JobNotInProgress);
        }

        job.deliverable_hash = Some(deliverable_hash);
        job.status = JobStatus::Completed;
        job.completed_at = Some(env.ledger().timestamp());
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        env.events().publish(
            (symbol_short!("deliver"),),
            (job_id, agent, deliverable_hash),
        );

        Ok(())
    }

    /// Approve deliverable and release escrow to agent
    pub fn approve_deliverable(
        env: Env,
        client: Address,
        job_id: u64,
    ) -> Result<(), Error> {
        client.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        let mut job = Self::get_job(&env, job_id)?;

        if job.client != client {
            return Err(Error::Unauthorized);
        }

        if job.status != JobStatus::Completed {
            return Err(Error::JobNotCompleted);
        }

        if job.deliverable_hash.is_none() {
            return Err(Error::InvalidDisputeEvidence);
        }

        // Get escrow
        let escrow_id: u64 = env.storage().instance()
            .get(&DataKey::EscrowByJob(job_id))
            .ok_or(Error::EscrowNotFound)?;
        let mut escrow = Self::get_escrow(&env, escrow_id)?;

        if escrow.status != EscrowStatus::Funded {
            return Err(Error::EscrowNotFunded);
        }

        // Release payment to agent
        let usdc_client = TokenClient::new(&env, &config.usdc_token);
        usdc_client.transfer(
            &env.current_contract_address(),
            &escrow.agent,
            &escrow.amount,
        );

        // Update escrow
        escrow.status = EscrowStatus::Released;
        escrow.released_at = Some(env.ledger().timestamp());
        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);

        // Update agent stats
        let agent_id: u64 = env.storage().instance()
            .get(&DataKey::AgentByOwner(escrow.agent.clone()))
            .ok_or(Error::AgentNotFound)?;
        let mut agent = Self::get_agent(&env, agent_id)?;
        agent.total_jobs_completed += 1;
        agent.total_earnings += escrow.amount;
        env.storage().instance().set(&DataKey::Agent(agent_id), &agent);

        // Update job
        job.status = JobStatus::Completed;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Update stats
        let mut stats = Self::get_platform_stats(&env)?;
        stats.avg_job_completion_time = (stats.avg_job_completion_time * stats.total_jobs + 
            (env.ledger().timestamp() - job.created_at)) / (stats.total_jobs + 1);
        env.storage().instance().set(&DataKey::PlatformStats, &stats);

        env.events().publish(
            (symbol_short!("approved"),),
            (job_id, escrow.agent, escrow.amount),
        );

        Ok(())
    }

    /// Raise a dispute
    pub fn raise_dispute(
        env: Env,
        raiser: Address,
        job_id: u64,
        reason: String,
        evidence_uri: String,
    ) -> Result<u64, Error> {
        raiser.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        let mut job = Self::get_job(&env, job_id)?;

        if job.client != raiser && job.assigned_agent != Some(raiser.clone()) {
            return Err(Error::Unauthorized);
        }

        if job.status == JobStatus::Disputed || job.status == JobStatus::Cancelled {
            return Err(Error::AlreadyDisputed);
        }

        if job.dispute_raised {
            return Err(Error::AlreadyDisputed);
        }

        // Check dispute window (measured from completion, falling back to creation)
        let window_start = job.completed_at.unwrap_or(job.created_at);
        let dispute_deadline = window_start + (config.dispute_window_days * 86400);
        if env.ledger().timestamp() > dispute_deadline {
            return Err(Error::DisputeWindowExpired);
        }

        // Get escrow
        let escrow_id: u64 = env.storage().instance()
            .get(&DataKey::EscrowByJob(job_id))
            .ok_or(Error::EscrowNotFound)?;
        let mut escrow = Self::get_escrow(&env, escrow_id)?;

        if escrow.status != EscrowStatus::Funded {
            return Err(Error::EscrowNotFunded);
        }

        // Create dispute
        let dispute_id = Self::next_dispute_id(&env)?;
        let now = env.ledger().timestamp();

        let dispute = Dispute {
            id: dispute_id,
            job_id,
            raised_by: raiser.clone(),
            reason,
            evidence_uri,
            status: DisputeStatus::Open,
            resolver: Some(config.dispute_resolver.clone()),
            resolution: None,
            created_at: now,
            resolved_at: None,
        };

        env.storage().instance().set(&DataKey::Dispute(dispute_id), &dispute);

        // Index dispute
        let mut job_disputes: Vec<u64> = env.storage().instance()
            .get(&DataKey::DisputesByJob(job_id))
            .unwrap_or(Vec::new(&env));
        job_disputes.push_back(dispute_id);
        env.storage().instance().set(&DataKey::DisputesByJob(job_id), &job_disputes);

        // Update job and escrow
        job.dispute_raised = true;
        job.status = JobStatus::Disputed;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        escrow.status = EscrowStatus::Disputed;
        escrow.dispute_raised_at = Some(now);
        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);

        // Update stats
        let mut stats = Self::get_platform_stats(&env)?;
        stats.total_disputes += 1;
        env.storage().instance().set(&DataKey::PlatformStats, &stats);

        env.events().publish(
            (symbol_short!("dispute"),),
            (dispute_id, job_id, raiser, dispute.reason.clone()),
        );

        Ok(dispute_id)
    }

    /// Resolve dispute (by authorized resolver)
    pub fn resolve_dispute(
        env: Env,
        resolver: Address,
        dispute_id: u64,
        resolution: String, // "agent" | "client" | "split"
        split_percentage: Option<u32>, // If split, percentage to agent
    ) -> Result<(), Error> {
        resolver.require_auth();

        let config = Self::get_config(&env)?;
        if resolver != config.dispute_resolver && resolver != config.admin {
            return Err(Error::UnauthorizedResolver);
        }

        let mut dispute = Self::get_dispute(&env, dispute_id)?;

        if dispute.status != DisputeStatus::Open && dispute.status != DisputeStatus::UnderReview {
            return Err(Error::DisputeResolved);
        }

        if dispute.resolver != Some(resolver.clone()) && resolver != config.admin {
            return Err(Error::UnauthorizedResolver);
        }

        // Get job and escrow
        let mut job = Self::get_job(&env, dispute.job_id)?;
        let escrow_id: u64 = env.storage().instance()
            .get(&DataKey::EscrowByJob(dispute.job_id))
            .ok_or(Error::EscrowNotFound)?;
        let mut escrow = Self::get_escrow(&env, escrow_id)?;

        let usdc_client = TokenClient::new(&env, &config.usdc_token);

        // Deduct the (higher) dispute fee from the escrow payout.
        let dispute_fee = (escrow.amount * config.platform_fee_bps_dispute as i128) / 10000;
        let payout = escrow.amount - dispute_fee;
        if dispute_fee > 0 {
            usdc_client.transfer(
                &env.current_contract_address(),
                &config.platform_fee_recipient,
                &dispute_fee,
            );
        }

        match resolution.as_str() {
            "agent" => {
                // Full payment to agent (minus dispute fee)
                usdc_client.transfer(
                    &env.current_contract_address(),
                    &escrow.agent,
                    &payout,
                );
                escrow.status = EscrowStatus::Released;
                job.status = JobStatus::Completed;
            }
            "client" => {
                // Full refund to client (minus dispute fee)
                usdc_client.transfer(
                    &env.current_contract_address(),
                    &escrow.client,
                    &payout,
                );
                escrow.status = EscrowStatus::Refunded;
                job.status = JobStatus::Refunded;
            }
            "split" => {
                let percentage = split_percentage.unwrap_or(50);
                if percentage > 100 {
                    return Err(Error::InvalidConfig);
                }
                let agent_amount = (payout * percentage as i128) / 100;
                let client_amount = payout - agent_amount;

                usdc_client.transfer(
                    &env.current_contract_address(),
                    &escrow.agent,
                    &agent_amount,
                );
                usdc_client.transfer(
                    &env.current_contract_address(),
                    &escrow.client,
                    &client_amount,
                );
                escrow.status = EscrowStatus::Released;
                job.status = JobStatus::Completed;
            }
            _ => return Err(Error::InvalidConfig),
        }

        escrow.resolver = Some(resolver.clone());
        escrow.released_at = Some(env.ledger().timestamp());
        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);

        dispute.status = DisputeStatus::Resolved;
        dispute.resolution = Some(resolution);
        dispute.resolved_at = Some(env.ledger().timestamp());
        env.storage().instance().set(&DataKey::Dispute(dispute_id), &dispute);

        env.storage().instance().set(&DataKey::Job(dispute.job_id), &job);

        env.events().publish(
            (symbol_short!("dispute_res"),),
            (dispute_id, resolver, resolution),
        );

        Ok(())
    }

    /// Leave a review for a job
    pub fn leave_review(
        env: Env,
        reviewer: Address,
        job_id: u64,
        rating: u32,
        comment: String,
    ) -> Result<(), Error> {
        reviewer.require_auth();
        Self::ensure_not_paused(&env)?;

        let job = Self::get_job(&env, job_id)?;

        // Verify reviewer is part of the job
        if job.client != reviewer && job.assigned_agent != Some(reviewer.clone()) {
            return Err(Error::Unauthorized);
        }

        if job.status != JobStatus::Completed && job.status != JobStatus::Refunded {
            return Err(Error::JobNotCompleted);
        }

        if rating < 1 || rating > 5 {
            return Err(Error::InvalidRating);
        }

        // Check if already reviewed
        let existing_reviews: Vec<u64> = env.storage().instance()
            .get(&DataKey::ReviewsByReviewee(
                if job.client == reviewer { job.assigned_agent.unwrap() } else { job.client.clone() }
            ))
            .unwrap_or(Vec::new(&env));

        for review_id in existing_reviews.iter() {
            let review = Self::get_review(&env, review_id)?;
            if review.job_id == job_id && review.reviewer == reviewer {
                return Err(Error::AlreadyReviewed);
            }
        }

        let review_id = Self::next_review_id(&env)?;
        let now = env.ledger().timestamp();

        let reviewee = if job.client == reviewer { 
            job.assigned_agent.unwrap() 
        } else { 
            job.client.clone() 
        };

        let review = Review {
            id: review_id,
            job_id,
            reviewer: reviewer.clone(),
            reviewee: reviewee.clone(),
            rating,
            comment,
            created_at: now,
        };

        env.storage().instance().set(&DataKey::Review(review_id), &review);

        // Index review
        let mut reviewee_reviews: Vec<u64> = env.storage().instance()
            .get(&DataKey::ReviewsByReviewee(reviewee.clone()))
            .unwrap_or(Vec::new(&env));
        reviewee_reviews.push_back(review_id);
        env.storage().instance().set(&DataKey::ReviewsByReviewee(reviewee.clone()), &reviewee_reviews);

        // Update agent reputation when the client reviews the agent
        if job.client == reviewer {
            let agent_id: u64 = env.storage().instance()
                .get(&DataKey::AgentByOwner(reviewee.clone()))
                .ok_or(Error::AgentNotFound)?;
            let mut agent = Self::get_agent(&env, agent_id)?;
            // Reputation is a 0-100 rolling average of review ratings (1-5).
            let prior_reviews = reviewee_reviews.len().saturating_sub(1) as u32;
            let rating_score = rating * 20;
            let new_reputation = if prior_reviews == 0 {
                rating_score
            } else {
                (agent.reputation * prior_reviews + rating_score) / (prior_reviews + 1)
            };
            agent.reputation = new_reputation;
            env.storage().instance().set(&DataKey::Agent(agent_id), &agent);
        }

        env.events().publish(
            (symbol_short!("review"),),
            (review_id, job_id, reviewer, reviewee, rating),
        );

        Ok(())
    }


    /// Reclaim escrow funds after expiry (client only)
    ///
    /// If an agent accepts a job but never submits a deliverable, the client's
    /// USDC would otherwise be locked forever.  This function allows the client
    /// to reclaim the escrowed amount once `config.escrow_expiry_days` have
    /// elapsed since the escrow was created.
    ///
    /// Preconditions:
    ///   - Caller must be the job's client.
    ///   - Escrow status must be `Funded` (not already released/refunded/disputed).
    ///   - `now > escrow.created_at + (config.escrow_expiry_days * 86_400)`.
    ///
    /// Effects:
    ///   - Transfers `escrow.amount` back to the client.
    ///   - Sets `escrow.status = EscrowStatus::Refunded`.
    ///   - Sets `job.status    = JobStatus::Refunded`.
    ///   - Emits a `refund` event.
    pub fn reclaim_expired_escrow(
        env: Env,
        client: Address,
        job_id: u64,
    ) -> Result<(), Error> {
        client.require_auth();
        Self::ensure_not_paused(&env)?;

        let config = Self::get_config(&env)?;
        let mut job = Self::get_job(&env, job_id)?;

        // Only the job's client may reclaim
        if job.client != client {
            return Err(Error::Unauthorized);
        }

        // Look up the escrow
        let escrow_id: u64 = env.storage().instance()
            .get(&DataKey::EscrowByJob(job_id))
            .ok_or(Error::EscrowNotFound)?;
        let mut escrow = Self::get_escrow(&env, escrow_id)?;

        // Escrow must still be in Funded state
        if escrow.status != EscrowStatus::Funded {
            return Err(Error::EscrowNotFunded);
        }

        // Verify the expiry window has passed
        let expiry_seconds = config.escrow_expiry_days * 86_400;
        let expiry_time = escrow.created_at + expiry_seconds;
        if env.ledger().timestamp() <= expiry_time {
        // Note: EscrowExpired is repurposed here to mean 'not yet expired / too early to reclaim'.
        // A future refactor may introduce a dedicated EscrowNotExpired error variant.
            return Err(Error::EscrowExpired);
        }

        // Transfer the escrowed amount back to the client
        let usdc_client = TokenClient::new(&env, &config.usdc_token);
        usdc_client.transfer(
            &env.current_contract_address(),
            &client,
            &escrow.amount,
        );

        // Update escrow state
        escrow.status = EscrowStatus::Refunded;
        escrow.released_at = Some(env.ledger().timestamp());
        env.storage().instance().set(&DataKey::Escrow(escrow_id), &escrow);

        // Update job state
        job.status = JobStatus::Refunded;
        env.storage().instance().set(&DataKey::Job(job_id), &job);

        // Emit refund event
        env.events().publish(
            (symbol_short!("refund"),),
            (job_id, client, escrow.amount),
        );

        Ok(())
    }

    /// Get agent by ID
    pub fn get_agent(env: Env, agent_id: u64) -> Result<Agent, Error> {
        Self::get_agent(&env, agent_id)
    }

    /// Get job by ID
    pub fn get_job(env: Env, job_id: u64) -> Result<Job, Error> {
        Self::get_job(&env, job_id)
    }

    /// Get bid by ID
    pub fn get_bid(env: Env, bid_id: u64) -> Result<Bid, Error> {
        Self::get_bid(&env, bid_id)
    }

    /// Get escrow by ID
    pub fn get_escrow(env: Env, escrow_id: u64) -> Result<Escrow, Error> {
        Self::get_escrow(&env, escrow_id)
    }

    /// Get dispute by ID
    pub fn get_dispute(env: Env, dispute_id: u64) -> Result<Dispute, Error> {
        Self::get_dispute(&env, dispute_id)
    }

    /// Get review by ID
    pub fn get_review(env: Env, review_id: u64) -> Result<Review, Error> {
        Self::get_review(&env, review_id)
    }

    /// Get jobs by client (paginated).
    ///
    /// Returns a slice of the client's job-ID list starting at `offset` with
    /// at most `limit` entries.  Returns an empty Vec when `offset` is beyond
    /// the end of the stored list or when `limit` is 0.
    ///
    /// Clients should walk pages by incrementing `offset` by `limit` until the
    /// returned Vec has fewer elements than `limit` (indicating the final page).
    pub fn get_jobs_by_client(
        env: Env,
        client: Address,
        offset: u64,
        limit: u64,
    ) -> Vec<u64> {
        let all: Vec<u64> = env.storage().instance()
            .get(&DataKey::JobsByClient(client))
            .unwrap_or(Vec::new(&env));
        Self::paginate(&env, &all, offset, limit)
    }

    /// Get jobs by agent (paginated).
    ///
    /// Returns a slice of the agent's job-ID list starting at `offset` with
    /// at most `limit` entries.  Returns an empty Vec when `offset` is out of
    /// bounds or `limit` is 0.
    pub fn get_jobs_by_agent(
        env: Env,
        agent: Address,
        offset: u64,
        limit: u64,
    ) -> Vec<u64> {
        let all: Vec<u64> = env.storage().instance()
            .get(&DataKey::JobsByAgent(agent))
            .unwrap_or(Vec::new(&env));
        Self::paginate(&env, &all, offset, limit)
    }

    /// Get bids by job (paginated).
    ///
    /// Returns a slice of bid IDs for the given job starting at `offset` with
    /// at most `limit` entries.
    pub fn get_bids_by_job(
        env: Env,
        job_id: u64,
        offset: u64,
        limit: u64,
    ) -> Vec<u64> {
        let all: Vec<u64> = env.storage().instance()
            .get(&DataKey::BidsByJob(job_id))
            .unwrap_or(Vec::new(&env));
        Self::paginate(&env, &all, offset, limit)
    }

    /// Get bids by agent (paginated).
    ///
    /// Returns a slice of the agent's bid-ID list starting at `offset` with
    /// at most `limit` entries.
    pub fn get_bids_by_agent(
        env: Env,
        agent: Address,
        offset: u64,
        limit: u64,
    ) -> Vec<u64> {
        let all: Vec<u64> = env.storage().instance()
            .get(&DataKey::BidsByAgent(agent))
            .unwrap_or(Vec::new(&env));
        Self::paginate(&env, &all, offset, limit)
    }

    /// Get reviews for an agent/user (paginated).
    ///
    /// Returns a slice of review IDs for the reviewee starting at `offset`
    /// with at most `limit` entries.
    pub fn get_reviews_by_reviewee(
        env: Env,
        reviewee: Address,
        offset: u64,
        limit: u64,
    ) -> Vec<u64> {
        let all: Vec<u64> = env.storage().instance()
            .get(&DataKey::ReviewsByReviewee(reviewee))
            .unwrap_or(Vec::new(&env));
        Self::paginate(&env, &all, offset, limit)
    }

    /// Get agents by skill (paginated).
    ///
    /// Returns a slice of agent IDs that have the given skill starting at
    /// `offset` with at most `limit` entries.
    pub fn get_agents_by_skill(
        env: Env,
        skill: String,
        offset: u64,
        limit: u64,
    ) -> Vec<u64> {
        let all: Vec<u64> = env.storage().instance()
            .get(&DataKey::SkillAgents(skill))
            .unwrap_or(Vec::new(&env));
        Self::paginate(&env, &all, offset, limit)
    }

    /// Get all agents (paginated).
    ///
    /// Returns full `Agent` records for the page starting at `offset` with at
    /// most `limit` entries. Agent IDs are sequential and never deleted, so a
    /// list index `i` maps to agent id `i + 1`. Returns an empty Vec when
    /// `offset` is beyond the last agent or `limit` is 0.
    pub fn get_all_agents(env: Env, offset: u64, limit: u64) -> Vec<Agent> {
        let count: u64 = env.storage().instance()
            .get(&DataKey::AgentCounter)
            .unwrap_or(0);
        let mut page = Vec::new(&env);
        if limit == 0 || offset >= count {
            return page;
        }
        let end = (offset + limit).min(count);
        for idx in offset..end {
            let id = idx + 1;
            if let Ok(agent) = Self::get_agent(&env, id) {
                page.push_back(agent);
            }
        }
        page
    }

    /// Get all jobs (paginated).
    ///
    /// Returns full `Job` records for the page starting at `offset` with at
    /// most `limit` entries. Job IDs are sequential and never deleted, so a
    /// list index `i` maps to job id `i + 1`. Callers can filter the returned
    /// page client-side by status (e.g. only show `Open` jobs). Returns an
    /// empty Vec when `offset` is beyond the last job or `limit` is 0.
    pub fn get_all_jobs(env: Env, offset: u64, limit: u64) -> Vec<Job> {
        let count: u64 = env.storage().instance()
            .get(&DataKey::JobCounter)
            .unwrap_or(0);
        let mut page = Vec::new(&env);
        if limit == 0 || offset >= count {
            return page;
        }
        let end = (offset + limit).min(count);
        for idx in offset..end {
            let id = idx + 1;
            if let Ok(job) = Self::get_job(&env, id) {
                page.push_back(job);
            }
        }
        page
    }

    /// Get the agent owned by `owner`, if any.
    ///
    /// Returns `Some(Agent)` when the owner has registered an agent, otherwise
    /// `None`.
    pub fn get_agent_by_owner(env: Env, owner: Address) -> Option<Agent> {
        let agent_id: Option<u64> = env.storage().instance()
            .get(&DataKey::AgentByOwner(owner));
        agent_id.and_then(|id| Self::get_agent(&env, id).ok())
    }

    /// Get the escrow funding a job, if any.
    ///
    /// Returns `Some(Escrow)` when a bid has been accepted and escrow funded
    /// for the job, otherwise `None`.
    pub fn get_escrow_by_job(env: Env, job_id: u64) -> Option<Escrow> {
        let escrow_id: Option<u64> = env.storage().instance()
            .get(&DataKey::EscrowByJob(job_id));
        escrow_id.and_then(|id| Self::get_escrow(&env, id).ok())
    }

    /// Get platform configuration
    pub fn get_config(env: Env) -> Result<Config, Error> {
        Self::get_config(&env)
    }

    /// Get platform statistics
    pub fn get_platform_stats(env: Env) -> PlatformStats {
        Self::get_platform_stats(&env).unwrap_or(PlatformStats {
            total_agents: 0,
            total_jobs: 0,
            total_volume: 0,
            total_fees_collected: 0,
            total_disputes: 0,
            avg_job_completion_time: 0,
        })
    }

    /// Admin: Update configuration
    pub fn update_config(
        env: Env,
        admin: Address,
        platform_fee_bps: Option<u32>,
        min_job_budget: Option<i128>,
        max_job_deadline_days: Option<u64>,
        dispute_window_days: Option<u64>,
        min_agent_reputation: Option<u32>,
        platform_fee_recipient: Option<Address>,
        dispute_resolver: Option<Address>,
        min_agent_reputation_to_bid: Option<u32>,
        platform_fee_bps_dispute: Option<u32>,
        escrow_expiry_days: Option<u64>,
        skill_verifiers: Option<Vec<Address>>,
        require_skill_verification: Option<bool>,
    ) -> Result<(), Error> {
        admin.require_auth();

        let mut config = Self::get_config(&env)?;
        if config.admin != admin {
            return Err(Error::Unauthorized);
        }

        if let Some(fee) = platform_fee_bps {
            if fee > 10000 {
                return Err(Error::InvalidConfig);
            }
            config.platform_fee_bps = fee;
        }
        if let Some(budget) = min_job_budget {
            config.min_job_budget = budget;
        }
        if let Some(days) = max_job_deadline_days {
            config.max_job_deadline_days = days;
        }
        if let Some(days) = dispute_window_days {
            config.dispute_window_days = days;
        }
        if let Some(rep) = min_agent_reputation {
            config.min_agent_reputation = rep;
        }
        if let Some(recipient) = platform_fee_recipient {
            config.platform_fee_recipient = recipient;
        }
        if let Some(resolver) = dispute_resolver {
            config.dispute_resolver = resolver;
        }
        if let Some(rep) = min_agent_reputation_to_bid {
            config.min_agent_reputation_to_bid = rep;
        }
        if let Some(fee) = platform_fee_bps_dispute {
            config.platform_fee_bps_dispute = fee;
        }
        if let Some(days) = escrow_expiry_days {
            config.escrow_expiry_days = days;
        }
        if let Some(verifiers) = skill_verifiers {
            config.skill_verifiers = verifiers;
        }
        if let Some(flag) = require_skill_verification {
            config.require_skill_verification = flag;
        }

        env.storage().instance().set(&DataKey::Config, &config);

        env.events().publish(
            (symbol_short!("config_upd"),),
            admin,
        );

        Ok(())
    }

    /// Admin: Add skill verifier
    pub fn add_skill_verifier(env: Env, admin: Address, verifier: Address) -> Result<(), Error> {
        admin.require_auth();

        let mut config = Self::get_config(&env)?;
        if config.admin != admin {
            return Err(Error::Unauthorized);
        }

        if !config.skill_verifiers.contains(&verifier) {
            config.skill_verifiers.push_back(verifier.clone());
            env.storage().instance().set(&DataKey::Config, &config);
        }

        Ok(())
    }

    /// Admin: Remove skill verifier
    pub fn remove_skill_verifier(env: Env, admin: Address, verifier: Address) -> Result<(), Error> {
        admin.require_auth();

        let mut config = Self::get_config(&env)?;
        if config.admin != admin {
            return Err(Error::Unauthorized);
        }

        config.skill_verifiers = config.skill_verifiers.iter()
            .filter(|v| v != &verifier)
            .collect();
        env.storage().instance().set(&DataKey::Config, &config);

        Ok(())
    }

    // ========== Helper Functions ==========
}

// Private helpers — separate impl block so they are not exposed as contract
// entry-points by the #[contractimpl] macro above.
impl AiAgentMarketplace {
    // ========== Helper Functions ==========

    /// Slice a Vec<u64> from `offset` up to `offset + limit`.
    ///
    /// - Returns an empty Vec when `offset >= all.len()` or `limit == 0`.
    /// - Clamps the end index to the actual length so callers never need to
    ///   worry about out-of-bounds accesses.
    fn paginate(env: &Env, all: &Vec<u64>, offset: u64, limit: u64) -> Vec<u64> {
        let total = all.len() as u64;
        if limit == 0 || offset >= total {
            return Vec::new(env);
        }
        let start = offset as u32;
        let end_exclusive = ((offset + limit).min(total)) as u32;
        let mut page = Vec::new(env);
        for i in start..end_exclusive {
            page.push_back(all.get(i).unwrap());
        }
        page
    }

    fn has_config(env: &Env) -> bool {
        env.storage().instance().has(&DataKey::Config)
    }

    fn get_config(env: &Env) -> Result<Config, Error> {
        env.storage().instance()
            .get(&DataKey::Config)
            .ok_or(Error::NotInitialized)
    }

    fn ensure_not_paused(env: &Env) -> Result<(), Error> {
        let paused: bool = env.storage().instance().get(&DataKey::IsPaused).unwrap_or(false);
        if paused {
            return Err(Error::ContractPaused);
        }
        Ok(())
    }

    fn get_agent(env: &Env, agent_id: u64) -> Result<Agent, Error> {
        env.storage().instance()
            .get(&DataKey::Agent(agent_id))
            .ok_or(Error::AgentNotFound)
    }

    fn get_job(env: &Env, job_id: u64) -> Result<Job, Error> {
        env.storage().instance()
            .get(&DataKey::Job(job_id))
            .ok_or(Error::JobNotFound)
    }

    fn get_bid(env: &Env, bid_id: u64) -> Result<Bid, Error> {
        env.storage().instance()
            .get(&DataKey::Bid(bid_id))
            .ok_or(Error::BidNotFound)
    }

    fn get_escrow(env: &Env, escrow_id: u64) -> Result<Escrow, Error> {
        env.storage().instance()
            .get(&DataKey::Escrow(escrow_id))
            .ok_or(Error::EscrowNotFound)
    }

    fn get_dispute(env: &Env, dispute_id: u64) -> Result<Dispute, Error> {
        env.storage().instance()
            .get(&DataKey::Dispute(dispute_id))
            .ok_or(Error::DisputeNotFound)
    }

    fn get_review(env: &Env, review_id: u64) -> Result<Review, Error> {
        env.storage().instance()
            .get(&DataKey::Review(review_id))
            .ok_or(Error::ReviewNotFound)
    }

    fn get_platform_stats(env: &Env) -> Result<PlatformStats, Error> {
        env.storage().instance()
            .get(&DataKey::PlatformStats)
            .ok_or(Error::NotInitialized)
    }

    fn next_agent_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::AgentCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::AgentCounter, &new_id);
        Ok(new_id)
    }

    fn next_job_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::JobCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::JobCounter, &new_id);
        Ok(new_id)
    }

    fn next_bid_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::BidCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::BidCounter, &new_id);
        Ok(new_id)
    }

    fn next_review_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::ReviewCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::ReviewCounter, &new_id);
        Ok(new_id)
    }

    fn next_dispute_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::DisputeCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::DisputeCounter, &new_id);
        Ok(new_id)
    }

    fn next_escrow_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::EscrowCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::EscrowCounter, &new_id);
        Ok(new_id)
    }

    fn next_verification_id(env: &Env) -> Result<u64, Error> {
        let id: u64 = env.storage().instance()
            .get(&DataKey::VerificationCounter)
            .unwrap_or(0);
        let new_id = id + 1;
        env.storage().instance().set(&DataKey::VerificationCounter, &new_id);
        Ok(new_id)
    }
}

#[cfg(test)]
mod test;
