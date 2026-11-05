//! Integration tests for AI Agent Marketplace contract

#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, IntoVal, String, Vec, Map, symbol_short,
    token::{Client as TokenClient, StellarAssetClient as TokenAdminClient},
};

fn create_token_contract(e: &Env) -> TokenClient {
    let admin = Address::generate(e);
    TokenAdminClient::new(e, &e.register_stellar_asset_contract_v2(admin.clone()))
}

fn create_marketplace_contract<'a>(
    e: &Env,
    admin: &Address,
    usdc: &Address,
) -> AiAgentMarketplaceClient<'a> {
    let contract_id = e.register_contract(None, AiAgentMarketplace);
    let client = AiAgentMarketplaceClient::new(e, &contract_id);

    client.initialize(
        admin,
        usdc,
        &100,           // platform_fee_bps (1%)
        &10_000_000,    // min_job_budget (10 USDC)
        &30,            // max_job_deadline_days
        &7,             // dispute_window_days
        &0,             // min_agent_reputation
        admin,
        admin,          // dispute_resolver
        &0,             // min_agent_reputation_to_bid
        &200,           // platform_fee_bps_dispute (2%)
        &30,            // escrow_expiry_days
        &Vec::new(e),   // skill_verifiers
    );

    client
}

#[test]
fn test_register_agent() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let client = create_marketplace_contract(&e, &admin, &usdc.address());

    let agent_id = client.register_agent(
        &owner,
        &String::from_str(&e, "Test Agent"),
        &String::from_str(&e, "Description"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000, // 50 USDC
        &String::from_str(&e, "ipfs://QmTest"),
    );

    assert_eq!(agent_id, 1);

    let agent = client.get_agent(&agent_id);
    assert_eq!(agent.owner, owner);
    assert_eq!(agent.name, String::from_str(&e, "Test Agent"));
    assert_eq!(agent.price_per_task, 50_000_000);
    assert!(agent.is_active);
}

#[test]
fn test_post_job() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let client = create_marketplace_contract(&e, &admin, &usdc.address());

    let job_id = client.post_job(
        &client_addr,
        &String::from_str(&e, "Test Job"),
        &String::from_str(&e, "Description"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000, // 100 USDC
        &14,
    );

    assert_eq!(job_id, 1);

    let job = client.get_job(&job_id);
    assert_eq!(job.client, client_addr);
    assert_eq!(job.budget, 100_000_000);
    assert_eq!(job.status, JobStatus::Open);
}

#[test]
fn test_place_bid() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Register agent
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000, // 80 USDC
        &7,
        &String::from_str(&e, "Proposal"),
    );

    assert_eq!(bid_id, 1);

    let bid = marketplace.get_bid(&bid_id);
    assert_eq!(bid.agent, agent_owner);
    assert_eq!(bid.amount, 80_000_000);
    assert_eq!(bid.status, BidStatus::Pending);
}

#[test]
fn test_accept_bid_and_escrow() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());
    let usdc_client = TokenClient::new(&e, &usdc.address());

    // Setup: mint USDC to client
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &100_000_000);

    // Register agent
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Accept bid (funds escrow)
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    // Check escrow
    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::InProgress);
    assert_eq!(job.assigned_agent, Some(agent_owner.clone()));
    assert_eq!(job.escrow_amount, 81_000_000); // 80M + 1% fee

    // Check balances
    assert_eq!(usdc_client.balance(&client_addr), 19_000_000); // 100M - 81M
    assert_eq!(usdc_client.balance(&marketplace.env().current_contract_address()), 81_000_000);

    // Check platform fee went to recipient
    assert_eq!(usdc_client.balance(&admin), 1_000_000); // 1% fee
}

#[test]
fn test_complete_job_flow() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());
    let usdc_client = TokenClient::new(&e, &usdc.address());

    // Mint to client
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &200_000_000);

    // Register agent
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Accept bid
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    // Submit deliverable
    let hash = BytesN::from_array(&e, &[1u8; 32]);
    marketplace.submit_deliverable(&agent_owner, &job_id, &hash);

    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Completed);
    assert_eq!(job.deliverable_hash, Some(hash));

    // Approve and release
    marketplace.approve_deliverable(&client_addr, &job_id);

    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Completed);

    // Check agent earnings
    let agent = marketplace.get_agent(&agent_id);
    assert_eq!(agent.total_jobs_completed, 1);
    assert_eq!(agent.total_earnings, 80_000_000);
    // Reputation is only updated by leave_review, not by approve_deliverable.
    // The agent starts with reputation 0 and no review has been left yet,
    // so it should still be 0 here.
    assert_eq!(agent.reputation, 0);

    // Check USDC transferred
    assert_eq!(usdc_client.balance(&agent_owner), 80_000_000);
}

#[test]
fn test_dispute_flow() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());
    let usdc_client = TokenClient::new(&e, &usdc.address());

    // Mint to client
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &200_000_000);

    // Register agent
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Accept bid
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    // Submit deliverable
    let hash = BytesN::from_array(&e, &[1u8; 32]);
    marketplace.submit_deliverable(&agent_owner, &job_id, &hash);

    // Client raises dispute
    let dispute_id = marketplace.raise_dispute(
        &client_addr,
        &job_id,
        &String::from_str(&e, "Deliverable not as specified"),
        &String::from_str(&e, "ipfs://QmEvidence"),
    );

    assert_eq!(dispute_id, 1);

    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Disputed);
    assert!(job.dispute_raised);

    // Resolver resolves in favor of agent
    marketplace.resolve_dispute(
        &admin,
        &dispute_id,
        &String::from_str(&e, "agent"),
        &Option::None,
    );

    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Completed);

    // Agent should have received payment
    assert_eq!(usdc_client.balance(&agent_owner), 80_000_000);

    // Resolve in favor of client (refund)
    let job_id2 = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job2"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    let bid_id2 = marketplace.place_bid(
        &agent_owner,
        &job_id2,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    marketplace.accept_bid(&client_addr, &job_id2, &bid_id2);
    marketplace.submit_deliverable(&agent_owner, &job_id2, &hash);

    let dispute_id2 = marketplace.raise_dispute(
        &client_addr,
        &job_id2,
        &String::from_str(&e, "Bad work"),
        &String::from_str(&e, "ipfs://QmEvidence"),
    );

    marketplace.resolve_dispute(
        &admin,
        &dispute_id2,
        &String::from_str(&e, "client"),
        &Option::None,
    );

    let job = marketplace.get_job(&job_id2);
    assert_eq!(job.status, JobStatus::Refunded);

    // Client should get refund
    assert_eq!(usdc_client.balance(&client_addr), 100_000_000); // 100M refunded
}

#[test]
fn test_skill_verification() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let verifier = Address::generate(&e);
    let owner = Address::generate(&e);
    let usdc = create_token_contract(&e);

    // Create marketplace with verifier
    let contract_id = e.register_contract(None, AiAgentMarketplace);
    let client = AiAgentMarketplaceClient::new(&e, &contract_id);

    client.initialize(
        &admin,
        &usdc.address(),
        &100,
        &10_000_000,
        &30,
        &7,
        &0,
        &admin,
        &admin,
        &0,
        &200,
        &30,
        &Vec::from_array(&e, [verifier.clone()]),
    );

    // Register agent
    let agent_id = client.register_agent(
        &owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Verify skill
    client.verify_skill(
        &verifier,
        &agent_id,
        &String::from_str(&e, "python"),
        &String::from_str(&e, "ipfs://QmProof"),
        &e.ledger().timestamp() + 86400 * 365, // 1 year
    );

    let agent = client.get_agent(&agent_id);
    assert!(agent.skills_verified.get(String::from_str(&e, "python")).unwrap_or(false));
}

#[test]
fn test_leave_review() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());
    let usdc_client = TokenClient::new(&e, &usdc.address());

    // Mint to client
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &200_000_000);

    // Register agent
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Accept bid
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    // Submit deliverable
    let hash = BytesN::from_array(&e, &[1u8; 32]);
    marketplace.submit_deliverable(&agent_owner, &job_id, &hash);

    // Approve
    marketplace.approve_deliverable(&client_addr, &job_id);

    // Leave review (client reviews agent)
    marketplace.leave_review(
        &client_addr,
        &job_id,
        &5,
        &String::from_str(&e, "Excellent work!"),
    );

    // Leave review (agent reviews client)
    marketplace.leave_review(
        &agent_owner,
        &job_id,
        &4,
        &String::from_str(&e, "Good client"),
    );

    // Check reviews exist (via platform stats)
    let stats = marketplace.get_platform_stats();
    assert_eq!(stats.total_jobs, 1);
}

#[test]
fn test_set_paused_and_circuit_breaker() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    assert!(!marketplace.is_paused());

    marketplace.set_paused(&admin, &true);
    assert!(marketplace.is_paused());

    marketplace.set_paused(&admin, &false);
    assert!(!marketplace.is_paused());
}

#[test]
fn test_reclaim_expired_escrow() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());
    let usdc_client = TokenClient::new(&e, &usdc.address());

    // Mint USDC to the client
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &100_000_000);

    // Register agent
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Accept bid -> funds escrow (escrow.created_at = current ledger timestamp)
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::InProgress);

    // Advance the ledger past the 30-day expiry window
    e.ledger().with_mut(|li| {
        li.timestamp += 30 * 86_400 + 1; // one second past expiry
    });

    // Client reclaims the expired escrow
    marketplace.reclaim_expired_escrow(&client_addr, &job_id);

    // Job and escrow should now be in Refunded state
    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Refunded);

    // Client gets back the bid amount (platform fee was already paid at accept_bid time)
    assert_eq!(usdc_client.balance(&client_addr), 80_000_000);
}

#[test]
fn test_reclaim_expired_escrow_not_expired() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Mint USDC
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &100_000_000);

    // Register agent, post job, place & accept bid
    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    // Do NOT advance time -- escrow is still within the expiry window
    // Attempting to reclaim should return EscrowExpired error
    let result = marketplace.try_reclaim_expired_escrow(&client_addr, &job_id);
    assert!(result.is_err());
}

// ==================== Pagination Tests ====================

#[test]
fn test_get_jobs_by_client_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Post 5 jobs
    for i in 1u64..=5 {
        marketplace.post_job(
            &client_addr,
            &String::from_str(&e, "Job"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &1,
        );
    }

    // Page 1: offset=0, limit=2  -> [1, 2]
    let page1 = marketplace.get_jobs_by_client(&client_addr, &0, &2);
    assert_eq!(page1.len(), 2);
    assert_eq!(page1.get(0).unwrap(), 1u64);
    assert_eq!(page1.get(1).unwrap(), 2u64);

    // Page 2: offset=2, limit=2  -> [3, 4]
    let page2 = marketplace.get_jobs_by_client(&client_addr, &2, &2);
    assert_eq!(page2.len(), 2);
    assert_eq!(page2.get(0).unwrap(), 3u64);
    assert_eq!(page2.get(1).unwrap(), 4u64);

    // Page 3 (partial): offset=4, limit=2  -> [5]
    let page3 = marketplace.get_jobs_by_client(&client_addr, &4, &2);
    assert_eq!(page3.len(), 1);
    assert_eq!(page3.get(0).unwrap(), 5u64);

    // Out of bounds: offset=10, limit=2  -> []
    let empty = marketplace.get_jobs_by_client(&client_addr, &10, &2);
    assert_eq!(empty.len(), 0);

    // Zero limit -> []
    let zero = marketplace.get_jobs_by_client(&client_addr, &0, &0);
    assert_eq!(zero.len(), 0);
}

#[test]
fn test_get_bids_by_job_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Post one job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &1,
    );

    // Register 3 agents and place bids
    for _ in 0..3 {
        let owner = Address::generate(&e);
        marketplace.register_agent(
            &owner,
            &String::from_str(&e, "Agent"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &String::from_str(&e, "ipfs://test"),
        );
        marketplace.place_bid(
            &owner,
            &job_id,
            &10_000_000,
            &1,
            &String::from_str(&e, "Proposal"),
        );
    }

    // First page: offset=0, limit=2
    let page1 = marketplace.get_bids_by_job(&job_id, &0, &2);
    assert_eq!(page1.len(), 2);

    // Second page: offset=2, limit=2 -> only 1 bid remains
    let page2 = marketplace.get_bids_by_job(&job_id, &2, &2);
    assert_eq!(page2.len(), 1);

    // Out of bounds
    let empty = marketplace.get_bids_by_job(&job_id, &100, &2);
    assert_eq!(empty.len(), 0);
}

#[test]
fn test_get_jobs_by_agent_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    let admin_token = TokenAdminClient::new(&e, &usdc.address());
    admin_token.mint(&client_addr, &1_000_000_000);

    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &String::from_str(&e, "ipfs://test"),
    );

    // Post & accept 3 jobs so they appear under agent's index
    for _ in 0..3 {
        let job_id = marketplace.post_job(
            &client_addr,
            &String::from_str(&e, "Job"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &1,
        );
        let bid_id = marketplace.place_bid(
            &agent_owner,
            &job_id,
            &10_000_000,
            &1,
            &String::from_str(&e, "Prop"),
        );
        marketplace.accept_bid(&client_addr, &job_id, &bid_id);
    }

    // Fetch first 2
    let page = marketplace.get_jobs_by_agent(&agent_owner, &0, &2);
    assert_eq!(page.len(), 2);

    // Fetch last 1
    let page2 = marketplace.get_jobs_by_agent(&agent_owner, &2, &2);
    assert_eq!(page2.len(), 1);
}

#[test]
fn test_get_bids_by_agent_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &String::from_str(&e, "ipfs://test"),
    );

    // Place bids on 4 different jobs
    for _ in 0..4 {
        let job_id = marketplace.post_job(
            &client_addr,
            &String::from_str(&e, "Job"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &1,
        );
        marketplace.place_bid(
            &agent_owner,
            &job_id,
            &10_000_000,
            &1,
            &String::from_str(&e, "Prop"),
        );
    }

    let page1 = marketplace.get_bids_by_agent(&agent_owner, &0, &3);
    assert_eq!(page1.len(), 3);

    let page2 = marketplace.get_bids_by_agent(&agent_owner, &3, &3);
    assert_eq!(page2.len(), 1);
}

#[test]
fn test_get_reviews_by_reviewee_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    let admin_token = TokenAdminClient::new(&e, &usdc.address());
    admin_token.mint(&client_addr, &1_000_000_000);

    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &String::from_str(&e, "ipfs://test"),
    );

    // Complete 3 jobs and leave reviews on each
    for _ in 0..3 {
        let job_id = marketplace.post_job(
            &client_addr,
            &String::from_str(&e, "Job"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &1,
        );
        let bid_id = marketplace.place_bid(
            &agent_owner,
            &job_id,
            &10_000_000,
            &1,
            &String::from_str(&e, "Prop"),
        );
        marketplace.accept_bid(&client_addr, &job_id, &bid_id);
        let hash = BytesN::from_array(&e, &[1u8; 32]);
        marketplace.submit_deliverable(&agent_owner, &job_id, &hash);
        marketplace.approve_deliverable(&client_addr, &job_id);
        marketplace.leave_review(
            &client_addr,
            &job_id,
            &5,
            &String::from_str(&e, "Great work!"),
        );
    }

    // First 2 reviews
    let page1 = marketplace.get_reviews_by_reviewee(&agent_owner, &0, &2);
    assert_eq!(page1.len(), 2);

    // Last review
    let page2 = marketplace.get_reviews_by_reviewee(&agent_owner, &2, &2);
    assert_eq!(page2.len(), 1);

    // Out of bounds
    let empty = marketplace.get_reviews_by_reviewee(&agent_owner, &99, &2);
    assert_eq!(empty.len(), 0);
}

#[test]
fn test_get_agents_by_skill_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    let skill = String::from_str(&e, "python");

    // Register 5 agents with the same skill
    for _ in 0..5 {
        let owner = Address::generate(&e);
        marketplace.register_agent(
            &owner,
            &String::from_str(&e, "Agent"),
            &String::from_str(&e, "Desc"),
            &Vec::from_array(&e, [skill.clone()]),
            &10_000_000,
            &String::from_str(&e, "ipfs://test"),
        );
    }

    let page1 = marketplace.get_agents_by_skill(&skill, &0, &3);
    assert_eq!(page1.len(), 3);

    let page2 = marketplace.get_agents_by_skill(&skill, &3, &3);
    assert_eq!(page2.len(), 2);

    let empty = marketplace.get_agents_by_skill(&skill, &10, &3);
    assert_eq!(empty.len(), 0);
}



// ==================== Bulk / Owner Lookup Tests ====================

#[test]
fn test_get_all_agents_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Register 3 agents
    for i in 0..3 {
        let owner = Address::generate(&e);
        marketplace.register_agent(
            &owner,
            &String::from_str(&e, "Agent"),
            &String::from_str(&e, "Desc"),
            &Vec::from_array(&e, [String::from_str(&e, "python")]),
            &10_000_000,
            &String::from_str(&e, "ipfs://test"),
        );
        let _ = i;
    }

    let page1 = marketplace.get_all_agents(&0, &2);
    assert_eq!(page1.len(), 2);
    assert_eq!(page1.get(0).unwrap().id, 1);
    assert_eq!(page1.get(1).unwrap().id, 2);

    let page2 = marketplace.get_all_agents(&2, &2);
    assert_eq!(page2.len(), 1);
    assert_eq!(page2.get(0).unwrap().id, 3);

    // limit == 0 -> empty
    assert_eq!(marketplace.get_all_agents(&0, &0).len(), 0);

    // offset beyond end -> empty
    assert_eq!(marketplace.get_all_agents(&10, &2).len(), 0);
}

#[test]
fn test_get_all_jobs_pagination() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Post 3 jobs
    for _ in 0..3 {
        marketplace.post_job(
            &client_addr,
            &String::from_str(&e, "Job"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &14,
        );
    }

    let page1 = marketplace.get_all_jobs(&0, &2);
    assert_eq!(page1.len(), 2);
    assert_eq!(page1.get(0).unwrap().id, 1);
    assert_eq!(page1.get(1).unwrap().id, 2);
    assert_eq!(page1.get(0).unwrap().status, JobStatus::Open);

    let page2 = marketplace.get_all_jobs(&2, &2);
    assert_eq!(page2.len(), 1);
    assert_eq!(page2.get(0).unwrap().id, 3);

    assert_eq!(marketplace.get_all_jobs(&0, &0).len(), 0);
    assert_eq!(marketplace.get_all_jobs(&10, &2).len(), 0);
}

#[test]
fn test_get_agent_by_owner() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let owner = Address::generate(&e);
    let other = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // No agent yet -> None
    assert!(marketplace.get_agent_by_owner(&owner).is_none());

    let agent_id = marketplace.register_agent(
        &owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &10_000_000,
        &String::from_str(&e, "ipfs://test"),
    );

    let found = marketplace.get_agent_by_owner(&owner);
    assert!(found.is_some());
    let agent = found.unwrap();
    assert_eq!(agent.id, agent_id);
    assert_eq!(agent.owner, owner);

    // Unknown owner -> None
    assert!(marketplace.get_agent_by_owner(&other).is_none());
}

#[test]
fn test_get_escrow_by_job() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    let admin_token = TokenAdminClient::new(&e, &usdc.address());
    admin_token.mint(&client_addr, &1_000_000_000);

    // Job with no accepted bid -> None
    let open_job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Open Job"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &14,
    );
    assert!(marketplace.get_escrow_by_job(&open_job_id).is_none());

    // Register agent, post a job, bid, and accept
    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &String::from_str(&e, "ipfs://test"),
    );

    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &14,
    );
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &10_000_000,
        &1,
        &String::from_str(&e, "Prop"),
    );
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    let esc = marketplace.get_escrow_by_job(&job_id);
    assert!(esc.is_some());
    let esc = esc.unwrap();
    assert_eq!(esc.job_id, job_id);
    assert_eq!(esc.amount, 10_000_000);
    assert_eq!(esc.status, EscrowStatus::Funded);
}


// ==================== Issue #19: Missing Edge Case Tests ====================

#[test]
fn test_dispute_split_resolution() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());
    let usdc_client = TokenClient::new(&e, &usdc.address());

    // Mint to client
    let admin_client = TokenAdminClient::new(&e, &usdc.address());
    admin_client.mint(&client_addr, &200_000_000);

    // Register agent
    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid (80 USDC)
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Accept bid -> escrow = 80M + 1M fee = 81M, but fee already sent to recipient.
    // Escrow holds 80_000_000 (bid amount only; fee was transferred out).
    marketplace.accept_bid(&client_addr, &job_id, &bid_id);

    // Submit deliverable
    let hash = BytesN::from_array(&e, &[1u8; 32]);
    marketplace.submit_deliverable(&agent_owner, &job_id, &hash);

    // Client raises dispute
    let dispute_id = marketplace.raise_dispute(
        &client_addr,
        &job_id,
        &String::from_str(&e, "Quality dispute"),
        &String::from_str(&e, "ipfs://QmEvidence"),
    );

    // Resolve with 50/50 split
    marketplace.resolve_dispute(
        &admin,
        &dispute_id,
        &String::from_str(&e, "split"),
        &Option::Some(50),
    );

    // Dispute fee = 2% of 80M = 1_600_000. Payout = 80M - 1.6M = 78_400_000.
    // Agent gets 50% of payout = 39_200_000.
    // Client gets 50% of payout = 39_200_000.
    assert_eq!(usdc_client.balance(&agent_owner), 39_200_000);
    assert_eq!(usdc_client.balance(&client_addr), 39_200_000);
}

#[test]
fn test_skill_verification_expiry_renewal() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let verifier = Address::generate(&e);
    let owner = Address::generate(&e);
    let usdc = create_token_contract(&e);

    // Create marketplace with verifier
    let contract_id = e.register_contract(None, AiAgentMarketplace);
    let client = AiAgentMarketplaceClient::new(&e, &contract_id);

    client.initialize(
        &admin,
        &usdc.address(),
        &100,
        &10_000_000,
        &30,
        &7,
        &0,
        &admin,
        &admin,
        &0,
        &200,
        &30,
        &Vec::from_array(&e, [verifier.clone()]),
    );

    // Register agent
    let agent_id = client.register_agent(
        &owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Verify skill with short expiry (1 day)
    let short_expiry = e.ledger().timestamp() + 86_400; // 1 day
    client.verify_skill(
        &verifier,
        &agent_id,
        &String::from_str(&e, "python"),
        &String::from_str(&e, "ipfs://QmProof1"),
        &short_expiry,
    );

    let agent = client.get_agent(&agent_id);
    assert!(agent.skills_verified.get(String::from_str(&e, "python")).unwrap_or(false));

    // Advance time past the expiry
    e.ledger().with_mut(|li| {
        li.timestamp += 86_400 * 2; // 2 days later — verification has expired
    });

    // Agent's skill_verified map still says true (we don't auto-clear it),
    // but the underlying verification record has expired.
    // The verify_skill function now checks for a valid (non-expired) verification
    // before rejecting, so re-verification should succeed.
    let new_expiry = e.ledger().timestamp() + 86_400 * 365; // 1 year
    client.verify_skill(
        &verifier,
        &agent_id,
        &String::from_str(&e, "python"),
        &String::from_str(&e, "ipfs://QmProof2"),
        &new_expiry,
    );

    let agent = client.get_agent(&agent_id);
    assert!(agent.skills_verified.get(String::from_str(&e, "python")).unwrap_or(false));
}

#[test]
fn test_cancel_job_with_existing_bids() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Register agent
    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // Place bid
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );

    // Cancel the job
    marketplace.cancel_job(&client_addr, &job_id);

    // Job should be Cancelled
    let job = marketplace.get_job(&job_id);
    assert_eq!(job.status, JobStatus::Cancelled);

    // Bid should be Rejected (not left as Pending)
    let bid = marketplace.get_bid(&bid_id);
    assert_eq!(bid.status, BidStatus::Rejected);
}

#[test]
fn test_duplicate_bid_rejected() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Register agent
    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // First bid — should succeed
    let bid_id = marketplace.place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal 1"),
    );
    assert_eq!(bid_id, 1);

    // Second bid by the same agent — should be rejected with BidAlreadyExists
    let result = marketplace.try_place_bid(
        &agent_owner,
        &job_id,
        &70_000_000,
        &5,
        &String::from_str(&e, "Proposal 2"),
    );
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::BidAlreadyExists);
}

#[test]
fn test_reputation_multi_review_rolling_average() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client1 = Address::generate(&e);
    let client2 = Address::generate(&e);
    let client3 = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    let admin_token = TokenAdminClient::new(&e, &usdc.address());
    admin_token.mint(&client1, &1_000_000_000);
    admin_token.mint(&client2, &1_000_000_000);
    admin_token.mint(&client3, &1_000_000_000);

    // Register agent (no required skills needed since jobs use empty skills)
    let agent_id = marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::new(&e),
        &10_000_000,
        &String::from_str(&e, "ipfs://test"),
    );

    // Helper: complete a job and leave a review with the given rating
    let clients = [&client1, &client2, &client3];
    let ratings = [5u32, 3, 4];

    for (i, (clt, rating)) in clients.iter().zip(ratings.iter()).enumerate() {
        let job_id = marketplace.post_job(
            clt,
            &String::from_str(&e, "Job"),
            &String::from_str(&e, "Desc"),
            &Vec::new(&e),
            &10_000_000,
            &14,
        );
        let bid_id = marketplace.place_bid(
            &agent_owner,
            &job_id,
            &10_000_000,
            &1,
            &String::from_str(&e, "Prop"),
        );
        marketplace.accept_bid(clt, &job_id, &bid_id);
        let hash = BytesN::from_array(&e, &[((i + 1) as u8; 32)]);
        marketplace.submit_deliverable(&agent_owner, &job_id, &hash);
        marketplace.approve_deliverable(clt, &job_id);
        marketplace.leave_review(
            clt,
            &job_id,
            rating,
            &String::from_str(&e, "Review"),
        );
    }

    // Reputation = rolling average of (rating * 20) for each review.
    // Review 1: rating=5 -> score=100, rep=100
    // Review 2: rating=3 -> score=60,  rep=(100*1 + 60) / 2 = 80
    // Review 3: rating=4 -> score=80,  rep=(80*2 + 80) / 3 = 80
    let agent = marketplace.get_agent(&agent_id);
    assert_eq!(agent.reputation, 80);
    assert_eq!(agent.total_jobs_completed, 3);
}

#[test]
fn test_non_admin_cannot_pause() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let non_admin = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Non-admin calling set_paused should return Unauthorized
    let result = marketplace.try_set_paused(&non_admin, &true);
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::Unauthorized);

    // Contract should not be paused
    assert!(!marketplace.is_paused());

    // Admin can still pause
    marketplace.set_paused(&admin, &true);
    assert!(marketplace.is_paused());
}

#[test]
fn test_place_bid_on_expired_job_deadline() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let agent_owner = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Register agent
    marketplace.register_agent(
        &agent_owner,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job with 1-day deadline
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &1, // 1 day deadline
    );

    // Advance time past the deadline
    e.ledger().with_mut(|li| {
        li.timestamp += 86_400 * 2; // 2 days later
    });

    // Bidding should fail with JobExpired
    let result = marketplace.try_place_bid(
        &agent_owner,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "Proposal"),
    );
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::JobExpired);
}

#[test]
fn test_agent_cannot_bid_on_own_job() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let client_addr = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Register agent — the owner is also the client who will post a job
    let agent_id = marketplace.register_agent(
        &client_addr,
        &String::from_str(&e, "Agent"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &50_000_000,
        &String::from_str(&e, "ipfs://QmTest"),
    );

    // Post job as the same user who owns the agent
    let job_id = marketplace.post_job(
        &client_addr,
        &String::from_str(&e, "My Job"),
        &String::from_str(&e, "Desc"),
        &Vec::from_array(&e, [String::from_str(&e, "python")]),
        &100_000_000,
        &14,
    );

    // The agent owner (who is also the client) attempts to bid on their own job
    let result = marketplace.try_place_bid(
        &client_addr,
        &job_id,
        &80_000_000,
        &7,
        &String::from_str(&e, "I can do this!"),
    );
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::CannotBidOnOwnJob);
}

#[test]
fn test_update_config_by_admin() {
    let e = Env::default();
    e.mock_all_auths();

    let admin = Address::generate(&e);
    let non_admin = Address::generate(&e);
    let new_recipient = Address::generate(&e);
    let usdc = create_token_contract(&e);
    let marketplace = create_marketplace_contract(&e, &admin, &usdc.address());

    // Admin updates platform fee from 100 (1%) to 200 (2%)
    marketplace.update_config(
        &admin,
        &Option::Some(200),    // platform_fee_bps
        &Option::None,         // min_job_budget
        &Option::None,         // max_job_deadline_days
        &Option::None,         // dispute_window_days
        &Option::None,         // min_agent_reputation
        &Option::Some(new_recipient.clone()), // platform_fee_recipient
        &Option::None,         // dispute_resolver
        &Option::None,         // min_agent_reputation_to_bid
        &Option::None,         // platform_fee_bps_dispute
        &Option::None,         // escrow_expiry_days
        &Option::None,         // skill_verifiers
    );

    // Verify config was updated
    let config = marketplace.get_config();
    assert_eq!(config.platform_fee_bps, 200);
    assert_eq!(config.platform_fee_recipient, new_recipient);

    // Non-admin cannot update config
    let result = marketplace.try_update_config(
        &non_admin,
        &Option::Some(300),
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
        &Option::None,
    );
    assert!(result.is_err());
    assert_eq!(result.unwrap_err(), Error::Unauthorized);

    // Config should be unchanged
    let config = marketplace.get_config();
    assert_eq!(config.platform_fee_bps, 200);
}
