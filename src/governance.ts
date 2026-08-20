import { CONFIG } from "./config";
import { openDb } from "./db";
import { lavadJson, LavadExecOptions } from "./lavad";

const { db } = openDb(CONFIG.dbPath);

interface Proposal {
  title?: string;
  summary?: string;
  id: string;
  content?: {
    "@type": string;
    title?: string;
    description?: string;
  };
  status: string;
  submit_time?: string;
  deposit_end_time?: string;
  voting_start_time?: string;
  voting_end_time?: string;
  total_deposit?: Array<{ denom: string; amount: string }>;
  final_tally_result?: {
    // Old format (v1beta1)
    yes?: string;
    abstain?: string;
    no?: string;
    no_with_veto?: string;
    // New format (v1)
    yes_count?: string;
    abstain_count?: string;
    no_count?: string;
    no_with_veto_count?: string;
  };
}

interface Vote {
  proposal_id: string;
  voter: string;
  option: string;
  tx_hash?: string;
}

// Use archive node for governance if available, otherwise fall back to regular node
const GOVERNANCE_NODE = CONFIG.archiveNode || CONFIG.node;

const LAVAD_OPTS: LavadExecOptions = {
  lavadBin: CONFIG.lavadBin,
  chainId: CONFIG.chainId,
  node: GOVERNANCE_NODE,
};

export async function collectGovernanceOnce() {
  const now = Date.now();
  console.log(`[governance] collecting at ${new Date(now).toISOString()}`);
  console.log(`[governance] using node: ${GOVERNANCE_NODE}${CONFIG.archiveNode ? ' (archive)' : ''}`);

  try {
    // Get all proposals
    const proposals = await lavadJson<{ proposals: Proposal[] }>(
      LAVAD_OPTS,
      ["query", "gov", "proposals"]
    );

    if (!proposals.proposals || !Array.isArray(proposals.proposals)) {
      console.log(`[governance] no proposals found`);
      return;
    }

    console.log(`[governance] found ${proposals.proposals.length} proposals`);

    // Get validator monikers for votes
    const validatorMonikers = new Map<string, string>();
    const validatorRows = db
      .prepare(
        `
        SELECT DISTINCT operator_address, moniker
        FROM validator_snapshots
        WHERE moniker IS NOT NULL AND moniker != ''
        ORDER BY ts DESC
      `
      )
      .all() as Array<{ operator_address: string; moniker: string }>;

    for (const row of validatorRows) {
      if (!validatorMonikers.has(row.operator_address)) {
        validatorMonikers.set(row.operator_address, row.moniker);
      }
    }

    const insertProposal = db.prepare(`
      INSERT OR REPLACE INTO governance_proposals (
        proposal_id, title, description, status,
        submit_time, deposit_end_time, voting_start_time, voting_end_time,
        total_deposit, yes_count, abstain_count, no_count, no_with_veto_count,
        yes_votes, abstain_votes, no_votes, no_with_veto_votes, total_votes,
        participation_rate, ts, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertVote = db.prepare(`
      INSERT OR REPLACE INTO governance_votes (
        proposal_id, operator_address, moniker, vote_option, tx_hash, ts, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // First, collect all votes for all proposals (with rate limiting to avoid flooding the RPC)
    const proposalVotesMap = new Map<number, Vote[]>();
    let totalVotesCollected = 0;
    
    // Only collect votes for active proposals or recent proposals (last 10)
    // This reduces load on the archive node
    const activeStatuses = ['PROPOSAL_STATUS_VOTING_PERIOD', 'PROPOSAL_STATUS_DEPOSIT_PERIOD'];
    const proposalsToCheck = proposals.proposals.filter(p => 
      activeStatuses.includes(p.status)
    );
    
    // If no active proposals, only check last 5 proposals for votes
    const proposalsForVotes = proposalsToCheck.length > 0 
      ? proposalsToCheck 
      : proposals.proposals.slice(0, 5);
    
    console.log(`[governance] checking votes for ${proposalsForVotes.length} proposals (${proposalsToCheck.length} active, ${proposals.proposals.length - proposalsToCheck.length} completed)`);
    
    for (let i = 0; i < proposalsForVotes.length; i++) {
      const prop = proposalsForVotes[i];
      const proposalId = parseInt(prop.id);
      if (isNaN(proposalId)) continue;

      try {
        const votesData = await lavadJson<{ votes?: Vote[] } | null>(
          LAVAD_OPTS,
          ["query", "gov", "votes", prop.id]
        );
        // Handle null or missing votes property
        if (votesData && Array.isArray(votesData.votes) && votesData.votes.length > 0) {
          proposalVotesMap.set(proposalId, votesData.votes);
          totalVotesCollected += votesData.votes.length;
        } else {
          proposalVotesMap.set(proposalId, []);
        }
        
        // Rate limiting: wait 100ms between requests to avoid flooding the RPC
        if (i < proposalsForVotes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (err: any) {
        // Only log if it's not a "no votes" error (some proposals may not have votes)
        const errMsg = err?.message || String(err);
        if (!errMsg.includes("not found") && !errMsg.includes("does not exist")) {
          console.log(`[governance] failed to get votes for proposal ${prop.id}:`, errMsg);
        }
        proposalVotesMap.set(proposalId, []);
        
        // Still wait even on error to avoid rate limiting
        if (i < proposalsForVotes.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    }
    console.log(`[governance] collected ${totalVotesCollected} total votes across all proposals`);

    // Then insert everything in a transaction
    const transaction = db.transaction(() => {
      for (const prop of proposals.proposals) {
        const proposalId = parseInt(prop.id);
        if (isNaN(proposalId)) continue;

        // Lava's gov module answers in v1: title/summary sit at the top level.
        // Reading the v1beta1 path (prop.content.title) returned undefined, which
        // is why every stored proposal was called "Proposal N" with no description.
        const title = prop.title || prop.content?.title || `Proposal ${prop.id}`;
        const description = prop.summary || prop.content?.description || "";
        const status = prop.status || "UNKNOWN";

        const totalDeposit = prop.total_deposit
          ?.map((d) => `${d.amount}${d.denom}`)
          .join(",") || "0ulava";

        const tally = prop.final_tally_result || {};
        
        // Support both formats: v1beta1 (yes/abstain/no/no_with_veto) and v1 (yes_count/abstain_count/no_count/no_with_veto_count)
        const yesCount = parseInt(tally.yes_count || tally.yes || "0", 10) || 0;
        const abstainCount = parseInt(tally.abstain_count || tally.abstain || "0", 10) || 0;
        const noCount = parseInt(tally.no_count || tally.no || "0", 10) || 0;
        const noWithVetoCount = parseInt(tally.no_with_veto_count || tally.no_with_veto || "0", 10) || 0;
        
        // For display, also store the raw values (voting power)
        const yesVotes = tally.yes_count || tally.yes || "0";
        const abstainVotes = tally.abstain_count || tally.abstain || "0";
        const noVotes = tally.no_count || tally.no || "0";
        const noWithVetoVotes = tally.no_with_veto_count || tally.no_with_veto || "0";

        const totalVotes = yesCount + abstainCount + noCount + noWithVetoCount;

        const votes = proposalVotesMap.get(proposalId) || [];

        // Calculate participation rate
        // If we have individual votes, use count of validators who voted
        // Otherwise, if total_votes > 0, we can estimate participation (but it's voting power, not count)
        const totalValidators = validatorMonikers.size || 1;
        let participationRate = 0;
        if (votes.length > 0) {
          // Use actual vote count
          participationRate = votes.length / totalValidators;
        } else if (totalVotes > 0) {
          // If we have voting power but no individual votes, we can't calculate accurate participation
          // Set to 0 or null - UI will handle this
          participationRate = 0;
        }

        // Map vote option
        const voteOptionMap: Record<string, string> = {
          "VOTE_OPTION_YES": "YES",
          "VOTE_OPTION_ABSTAIN": "ABSTAIN",
          "VOTE_OPTION_NO": "NO",
          "VOTE_OPTION_NO_WITH_VETO": "NO_WITH_VETO",
        };

        insertProposal.run(
          proposalId,
          title,
          description,
          status,
          prop.submit_time || "",
          prop.deposit_end_time || "",
          prop.voting_start_time || "",
          prop.voting_end_time || "",
          totalDeposit,
          yesCount.toString(),
          abstainCount.toString(),
          noCount.toString(),
          noWithVetoCount.toString(),
          yesVotes,
          abstainVotes,
          noVotes,
          noWithVetoVotes,
          totalVotes.toString(),
          participationRate,
          now,
          JSON.stringify(prop)
        );

        // Insert votes
        for (const vote of votes) {
          const operatorAddress = vote.voter;
          const moniker = validatorMonikers.get(operatorAddress) || null;
          const rawOption = Array.isArray((vote as any).options) && (vote as any).options.length
            ? String((vote as any).options[0]?.option ?? "")
            : String((vote as any).option ?? "");
          // v1 returns options: [{option, weight}]; the v1beta1 scalar is undefined here,
          // and undefined hit a NOT NULL column inside the transaction, rolling the
          // proposals back along with the votes.
          const voteOption = voteOptionMap[rawOption] || rawOption;

          insertVote.run(
            proposalId,
            operatorAddress,
            moniker,
            voteOption,
            vote.tx_hash || null,
            now,
            JSON.stringify(vote)
          );
        }
      }
    });

    transaction();
    
    // Count inserted votes
    const votesCount = db.prepare(`SELECT COUNT(*) as count FROM governance_votes`).get() as { count: number };
    console.log(`[governance] inserted ${proposals.proposals.length} proposals, ${votesCount.count} total votes in DB`);
  } catch (err) {
    console.error(`[governance] collectOnce failed:`, err);
    throw err;
  }
}

if (require.main === module) {
  collectGovernanceOnce()
    .then(() => {
      console.log("[governance] done");
      process.exit(0);
    })
    .catch((err) => {
      console.error("[governance] fatal:", err);
      process.exit(1);
    });
}
