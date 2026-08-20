import express from "express";
import { CONFIG } from "./config";
import { openDb } from "./db";
import { renderStandings, renderMethodology, renderGovernance, renderProposal, renderValidator, type Tiles } from "./pages";
import { createDelegationSnapshot } from "./snapshot";

const { db } = openDb(CONFIG.dbPath);
const app = express();

app.get("/api/validators", (req, res) => {
  // Latest snapshot per validator - always sorted by Polli Score
  const activeOnly = (req.query.active as string) === "true";
  const hideJailed = (req.query.hideJailed as string) === "true";
  const orderBy = "COALESCE(s.polli_score, 0) DESC, CAST(s.tokens AS INTEGER) DESC";
  
  const rows = db
    .prepare(
      `
      SELECT s.*,
             p.scoring_rate           AS official_score,
             p.status                 AS official_status,
             p.status_reason          AS official_status_reason,
             p.uptime_percentage_rate AS uptime_percentage_rate,
             json_extract(p.raw_json,'$.governanceParticipationRate') AS governance_participation_rate,
             json_extract(p.raw_json,'$.blockTimingScore')            AS block_timing_score,
             json_extract(p.raw_json,'$.jailedCount')                 AS jailed_count,
             p.ts                     AS polli_ts
      FROM validator_snapshots s
      JOIN (
        SELECT operator_address, MAX(ts) AS ts
        FROM validator_snapshots
        GROUP BY operator_address
      ) latest
      ON latest.operator_address = s.operator_address AND latest.ts = s.ts
      -- Офіційний скор Polli з останнього зрізу. НЕ плутати з polli_score:
      -- той рахується нашою власною формулою в score.ts і дає інше число.
      -- Join to the newest snapshot GLOBALLY, not per operator. Per-operator
      -- MAX(ts) resurrects validators that left the set months ago, complete
      -- with their final score, which then outranks everyone currently scored.
      LEFT JOIN polli_snapshots p
        ON p.operator_address = s.operator_address
       AND p.ts = (SELECT MAX(ts) FROM polli_snapshots)
      ${activeOnly ? "WHERE s.status = 'BOND_STATUS_BONDED'" : ""}
      ${hideJailed ? `${activeOnly ? "AND" : "WHERE"} s.jailed = 0 AND s.tombstoned = 0` : ""}
      ORDER BY ${orderBy}
    `
    )
    .all();

  // Rank is a value, not a row number: it must not renumber when the user sorts.
  const ranked = [...rows]
    .filter((r: any) => r.official_score != null)
    .sort((a: any, b: any) => b.official_score - a.official_score);
  const rankOf = new Map<string, number>();
  ranked.forEach((r: any, i: number) => rankOf.set(r.operator_address, i + 1));

  res.json({
    ts: Date.now(),
    polli_ts: (rows as any[]).reduce((m, r: any) => Math.max(m, r.polli_ts || 0), 0) || null,
    count: rows.length,
    validators: rows.map((r: any) => {
      let polliBreakdown = null;
      let missedBlocks21d = null;
      let slashes21d = null;
      let uptime21d = null;
      try {
        const raw = JSON.parse(r.raw_json || "{}");
        polliBreakdown = raw.polliBreakdown || null;
        missedBlocks21d = raw.missed_blocks_21d ?? null;
        slashes21d = raw.slashes_21d ?? null;
        uptime21d = raw.uptime_21d ?? null;
      } catch (e) {
        // Ignore parse errors
      }
      return {
        ts: r.ts,
        operator_address: r.operator_address,
        moniker: r.moniker,
        status: r.status,
        jailed: Boolean(r.jailed),
        tokens: r.tokens,
        commission_rate: r.commission_rate,
        missed_blocks_counter: r.missed_blocks_counter,
        signed_blocks_window: r.signed_blocks_window,
        jailed_until: r.jailed_until,
        tombstoned: Boolean(r.tombstoned),
        score: r.score,
        // Наша власна оцінка (score.ts). Це НЕ скор Polli.
        polli_score: r.polli_score ?? null,
        // Офіційне число, як його рахує Polli.
        official_score: r.official_score ?? null,
        official_status: r.official_status ?? null,
        official_status_reason: r.official_status_reason ?? null,
        // The four inputs Polli publishes but never adds up in public.
        uptime_percentage_rate: r.uptime_percentage_rate ?? null,
        governance_participation_rate: r.governance_participation_rate ?? null,
        block_timing_score: r.block_timing_score ?? null,
        jailed_count: r.jailed_count ?? null,
        polli_ts: r.polli_ts ?? null,
        rank: rankOf.get(r.operator_address) ?? null,
        polli_eligible: r.polli_eligible ? Boolean(r.polli_eligible) : null,
        polli_breakdown: polliBreakdown,
        missed_blocks_21d: missedBlocks21d,
        slashes_21d: slashes21d,
        uptime_21d: uptime21d
      };
    })
  });
});

app.get("/api/validators/:operator/jail-history", (req, res) => {
  const operator = req.params.operator;
  const months = parseInt((req.query.months as string) ?? "6", 10);
  const cutoffDate = Date.now() - (months * 30 * 24 * 60 * 60 * 1000); // Approximate months
  
  const rows = db
    .prepare(`
      SELECT ts, jailed, jailed_until, moniker, status
      FROM validator_snapshots
      WHERE operator_address = ?
        AND (jailed = 1 OR jailed_until IS NOT NULL)
        AND ts >= ?
      ORDER BY ts ASC
    `)
    .all(operator, cutoffDate) as any[];
  
  // Group by unique jail events
  // Count transitions from not-jailed to jailed, OR jail events where jailed_until is within the period
  const jailEvents: Array<{
    date: string;
    ts: number;
    jailed: boolean;
    jailed_until: string | null;
    status: string;
  }> = [];
  
  const seenJailUntil = new Set<string>(); // Track unique jailed_until dates to avoid duplicates
  
  let wasJailed = false;
  for (const row of rows) {
    const isJailed = Boolean(row.jailed || (row.jailed_until && Date.parse(row.jailed_until) > row.ts));
    
    // Count transition from not-jailed to jailed
    if (!wasJailed && isJailed) {
      jailEvents.push({
        date: new Date(row.ts).toISOString(),
        ts: row.ts,
        jailed: Boolean(row.jailed),
        jailed_until: row.jailed_until,
        status: row.status
      });
      if (row.jailed_until) {
        seenJailUntil.add(row.jailed_until);
      }
    }
    
    // Also count jail events by jailed_until date (for cases where we started collecting after jail ended)
    // If jailed_until is within the period, it means there was a jail event
    if (row.jailed_until && !seenJailUntil.has(row.jailed_until)) {
      const jailedUntilTs = Date.parse(row.jailed_until);
      if (Number.isFinite(jailedUntilTs) && jailedUntilTs >= cutoffDate) {
        seenJailUntil.add(row.jailed_until);
        // Check if this jail event is not already counted as a transition
        const alreadyCounted = jailEvents.some(e => e.jailed_until === row.jailed_until);
        if (!alreadyCounted) {
          jailEvents.push({
            date: new Date(jailedUntilTs).toISOString(),
            ts: jailedUntilTs,
            jailed: Boolean(row.jailed),
            jailed_until: row.jailed_until,
            status: row.status
          });
        }
      }
    }
    
    wasJailed = isJailed;
  }
  
  res.json({
    operator_address: operator,
    period_months: months,
    cutoff_date: new Date(cutoffDate).toISOString(),
    total_snapshots_with_jail: rows.length,
    unique_jail_events: jailEvents.length,
    jail_events: jailEvents
  });
});

app.get("/api/validators/:operator", (req, res) => {
  const op = req.params.operator;
  const rows = db
    .prepare(
      `
      SELECT *
      FROM validator_snapshots
      WHERE operator_address = ?
      ORDER BY ts DESC
      LIMIT 200
    `
    )
    .all(op);

  res.json({ operator_address: op, count: rows.length, snapshots: rows });
});

app.get("/api/polli/validators", (req, res) => {
  const recommendedOnly = (req.query.recommended as string) === "true";
  const limit = Math.max(1, Math.min(1000, parseInt((req.query.limit as string) ?? "200", 10)));

  const rows = db
    .prepare(
      `
      SELECT s.*, v.polli_score, v.polli_eligible
      FROM polli_snapshots s
      JOIN (
        SELECT operator_address, MAX(ts) AS ts
        FROM polli_snapshots
        GROUP BY operator_address
      ) latest
      ON latest.operator_address = s.operator_address AND latest.ts = s.ts
      LEFT JOIN (
        SELECT vs.operator_address, vs.polli_score, vs.polli_eligible
        FROM validator_snapshots vs
        JOIN (
          SELECT operator_address, MAX(ts) AS ts
          FROM validator_snapshots
          GROUP BY operator_address
        ) vs_latest
        ON vs_latest.operator_address = vs.operator_address AND vs_latest.ts = vs.ts
      ) v ON v.operator_address = s.operator_address
      ${recommendedOnly ? "WHERE s.status != 'NOT_RECOMMENDED'" : ""}
      ORDER BY s.scoring_rate DESC
      LIMIT ?
    `
    )
    .all(limit);

  res.json({
    ts: Date.now(),
    count: rows.length,
    validators: rows.map((r: any) => ({
      ts: r.ts,
      operator_address: r.operator_address,
      moniker: r.moniker,
      status: r.status,
      status_reason: r.status_reason,
      scoring_rate: r.scoring_rate,
      voting_power: r.voting_power,
      commission_rate: r.commission_rate,
      validator_apr: r.validator_apr,
      network_apr: r.network_apr,
      total_staked_tokens: r.total_staked_tokens,
      uptime_percentage_rate: r.uptime_percentage_rate,
      uptime_rate_last_window: r.uptime_rate_last_window,
      slash_count: r.slash_count,
      last_jailed_recover: r.last_jailed_recover ? JSON.parse(r.last_jailed_recover) : null,
      our_polli_score: r.polli_score ?? null,
      our_polli_eligible: r.polli_eligible ? Boolean(r.polli_eligible) : null
    }))
  });
});

app.get("/api/polli/top25", (req, res) => {
  const rows = db
    .prepare(
      `
      SELECT s.*
      FROM polli_snapshots s
      JOIN (
        SELECT operator_address, MAX(ts) AS ts
        FROM polli_snapshots
        GROUP BY operator_address
      ) latest
      ON latest.operator_address = s.operator_address AND latest.ts = s.ts
      WHERE s.status != 'NOT_RECOMMENDED'
      ORDER BY s.scoring_rate DESC
      LIMIT 25
    `
    )
    .all();

  res.json({
    ts: Date.now(),
    count: rows.length,
    validators: rows.map((r: any) => ({
      ts: r.ts,
      operator_address: r.operator_address,
      moniker: r.moniker,
      status: r.status,
      status_reason: r.status_reason,
      scoring_rate: r.scoring_rate,
      voting_power: r.voting_power,
      commission_rate: r.commission_rate,
      validator_apr: r.validator_apr,
      network_apr: r.network_apr,
      total_staked_tokens: r.total_staked_tokens,
      uptime_percentage_rate: r.uptime_percentage_rate,
      uptime_rate_last_window: r.uptime_rate_last_window,
      slash_count: r.slash_count,
      last_jailed_recover: r.last_jailed_recover ? JSON.parse(r.last_jailed_recover) : null
    }))
  });
});

app.get("/api/polli/diff", (req, res) => {
  const limit = Math.max(1, Math.min(500, parseInt((req.query.limit as string) ?? "100", 10)));
  const tsRows = db.prepare(`SELECT DISTINCT ts FROM polli_snapshots ORDER BY ts DESC LIMIT 2`).all() as { ts: number }[];
  if (tsRows.length < 2) {
    res.json({ ts: Date.now(), latest_ts: tsRows[0]?.ts ?? null, prev_ts: null, count: 0, validators: [] });
    return;
  }
  const latestTs = tsRows[0]?.ts ?? null;
  const prevTs = tsRows[1]?.ts ?? null;
  const rows = db
    .prepare(
      `
      WITH latest AS (
        SELECT *,
               ROW_NUMBER() OVER (ORDER BY scoring_rate DESC) AS rank
        FROM polli_snapshots
        WHERE ts=@latestTs AND status != 'NOT_RECOMMENDED'
      ),
      prev AS (
        SELECT operator_address,
               ROW_NUMBER() OVER (ORDER BY scoring_rate DESC) AS rank_prev,
               scoring_rate AS prev_score,
               status AS prev_status,
               status_reason AS prev_status_reason,
               total_staked_tokens AS prev_stake,
               uptime_rate_last_window AS prev_uptime,
               slash_count AS prev_slash,
               commission_rate AS prev_commission
        FROM polli_snapshots
        WHERE ts=@prevTs AND status != 'NOT_RECOMMENDED'
      )
      SELECT l.*, p.rank_prev, p.prev_score, p.prev_status, p.prev_status_reason, p.prev_stake,
             p.prev_uptime, p.prev_slash, p.prev_commission
      FROM latest l
      LEFT JOIN prev p USING(operator_address)
      ORDER BY l.rank
      LIMIT @limit
    `
    )
    .all({ latestTs, prevTs, limit });

  const toNum = (x: any): number | null => {
    const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
    return Number.isFinite(n) ? n : null;
  };

  res.json({
    ts: Date.now(),
    latest_ts: latestTs,
    prev_ts: prevTs,
    count: rows.length,
    new_count: rows.filter((r: any) => !r.rank_prev).length,
    dropped_count: (() => {
      const latestOps = new Set(rows.map((r: any) => r.operator_address));
      const prevOnly = db
        .prepare(
          `
          SELECT operator_address
          FROM polli_snapshots
          WHERE ts=@prevTs AND status != 'NOT_RECOMMENDED'
          ORDER BY scoring_rate DESC
          LIMIT 25
        `
        )
        .all({ prevTs }) as { operator_address: string }[];
      return prevOnly.filter((r) => !latestOps.has(r.operator_address)).length;
    })(),
    validators: rows.map((r: any) => {
      const prevStakeNum = toNum(r.prev_stake);
      const stakeNum = toNum(r.total_staked_tokens);
      const prevScore = toNum(r.prev_score);
      const rankChange = r.rank_prev ? r.rank_prev - r.rank : null;
      return {
        ts: r.ts,
        operator_address: r.operator_address,
        moniker: r.moniker,
        status: r.status,
        status_reason: r.status_reason,
        rank: r.rank,
        prev_rank: r.rank_prev ?? null,
        rank_change: rankChange,
        scoring_rate: r.scoring_rate,
        prev_score: prevScore,
        score_change: prevScore != null ? r.scoring_rate - prevScore : null,
        commission_rate: r.commission_rate,
        prev_commission_rate: r.prev_commission ?? null,
        total_staked_tokens: r.total_staked_tokens,
        prev_total_staked_tokens: r.prev_stake ?? null,
        stake_change: stakeNum != null && prevStakeNum != null ? stakeNum - prevStakeNum : null,
        uptime_rate_last_window: r.uptime_rate_last_window,
        prev_uptime_rate_last_window: r.prev_uptime ?? null,
        uptime_change:
          r.uptime_rate_last_window != null && r.prev_uptime != null
            ? r.uptime_rate_last_window - r.prev_uptime
            : null,
        slash_count: r.slash_count ?? null,
        prev_slash_count: r.prev_slash ?? null,
        slash_change:
          r.slash_count != null && r.prev_slash != null ? r.slash_count - r.prev_slash : null,
        prev_status: r.prev_status ?? null,
        prev_status_reason: r.prev_status_reason ?? null
      };
    })
  });
});

app.get("/api/polli/delegations/diff", (req, res) => {
  const limit = Math.max(1, Math.min(2000, parseInt((req.query.limit as string) ?? "500", 10)));
  const tsRows = db.prepare(`SELECT DISTINCT ts FROM polli_snapshots ORDER BY ts DESC LIMIT 2`).all() as { ts: number }[];
  if (tsRows.length < 2) {
    res.json({ ts: Date.now(), latest_ts: tsRows[0]?.ts ?? null, prev_ts: null, count: 0, validators: [] });
    return;
  }
  const latestTs = tsRows[0]?.ts ?? null;
  const prevTs = tsRows[1]?.ts ?? null;
  const rows = db
    .prepare(
      `
      WITH latest AS (
        SELECT *,
               ROW_NUMBER() OVER (ORDER BY CAST(total_staked_tokens AS REAL) DESC) AS rank
        FROM polli_snapshots
        WHERE ts=@latestTs
      ),
      prev AS (
        SELECT operator_address,
               total_staked_tokens AS prev_stake
        FROM polli_snapshots
        WHERE ts=@prevTs
      )
      SELECT l.*, p.prev_stake
      FROM latest l
      LEFT JOIN prev p USING(operator_address)
      ORDER BY l.rank
      LIMIT @limit
    `
    )
    .all({ latestTs, prevTs, limit });

  const toNum = (x: any): number | null => {
    const n = typeof x === "string" ? parseFloat(x) : typeof x === "number" ? x : NaN;
    return Number.isFinite(n) ? n : null;
  };

  res.json({
    ts: Date.now(),
    latest_ts: latestTs,
    prev_ts: prevTs,
    count: rows.length,
    validators: rows.map((r: any) => {
      const prevStakeNum = toNum(r.prev_stake);
      const stakeNum = toNum(r.total_staked_tokens);
      return {
        ts: r.ts,
        operator_address: r.operator_address,
        moniker: r.moniker,
        status: r.status,
        status_reason: r.status_reason,
        rank: r.rank,
        scoring_rate: r.scoring_rate,
        commission_rate: r.commission_rate,
        total_staked_tokens: r.total_staked_tokens,
        prev_total_staked_tokens: r.prev_stake ?? null,
        stake_change: stakeNum != null && prevStakeNum != null ? stakeNum - prevStakeNum : null,
        uptime_rate_last_window: r.uptime_rate_last_window,
        uptime_percentage_rate: r.uptime_percentage_rate,
        slash_count: r.slash_count
      };
    })
  });
});

app.get("/api/polli/meta", (_req, res) => {
  const lastRow = db
    .prepare(
      `
      SELECT MAX(ts) as ts
      FROM polli_snapshots
    `
    )
    .get() as { ts?: number };

  const lastTsFromDb = lastRow?.ts || null;
  const lastTs = CONFIG.polli.lastReviewTs ?? lastTsFromDb;
  const now = Date.now();
  // Assumption: review cycle ~21 days (21 * 24h)
  const cycleMs = 21 * 24 * 60 * 60 * 1000;
  const eta = lastTs ? lastTs + cycleMs : null;

  res.json({
    now,
    last_polli_snapshot_ts: lastTs,
    next_review_eta: eta,
    next_review_eta_human: eta ? new Date(eta).toISOString() : null,
    assumption_days: 21,
    source: CONFIG.polli.lastReviewTs ? "env" : "db"
  });
});

// ── HTML pages ──────────────────────────────────────────────────────────────
// Rendering lives in pages.ts; this file only gathers the data.

/** The four headline numbers. All computed live — nothing hardcoded, so a claim
 *  on the page cannot quietly go stale. */
function tiles(): Tiles {
  const latest = db.prepare(`SELECT MAX(ts) AS t FROM polli_snapshots`).get() as any;
  const ts = latest?.t ?? 0;
  const rows = db.prepare(
    `SELECT scoring_rate, raw_json FROM polli_snapshots WHERE ts = ? ORDER BY scoring_rate DESC`
  ).all(ts) as any[];

  const scores = rows.map((r) => Number(r.scoring_rate)).filter(Number.isFinite);
  const cutoff = scores.length >= 25 ? scores[24] : (scores.length ? scores[scores.length - 1] : null);

  const prevTs = db.prepare(
    `SELECT DISTINCT ts FROM polli_snapshots WHERE ts < ? ORDER BY ts DESC LIMIT 1`
  ).get(ts) as any;
  let cutoffDelta: number | null = null;
  if (prevTs?.ts) {
    const prev = db.prepare(
      `SELECT scoring_rate FROM polli_snapshots WHERE ts = ? ORDER BY scoring_rate DESC`
    ).all(prevTs.ts) as any[];
    if (prev.length >= 25 && cutoff !== null) cutoffDelta = cutoff - Number(prev[24].scoring_rate);
  }

  let voted = 0, zeroTiming = 0, matched = 0, maxErr = 0, newcomers = 0;
  for (const r of rows) {
    let j: any = {};
    try { j = JSON.parse(r.raw_json || "{}"); } catch { /* row stays counted as unscored */ }
    if (Number(j.governanceParticipationRate) === 100) voted++;
    if (!(Number(j.blockTimingScore) > 0)) zeroTiming++;
    // Reconstruction check: this is the claim the whole site rests on, so it is
    // recomputed on every render rather than asserted once in prose.
    const predicted = 35 + 0.2 * Number(j.uptimePercentageRate || 0)
      + 0.15 * Number(j.governanceParticipationRate || 0)
      + 0.3 * Number(j.blockTimingScore || 0)
      - 1.75 * Number(j.jailedCount || 0);
    const err = Math.abs(predicted - Number(r.scoring_rate));
    // Polli zeroes the score of validators without a track record ("Validator is
    // new — no track record yet") regardless of their components, so those are not
    // formula mismatches and must not be counted as such.
    const isNew = Number(r.scoring_rate) === 0 && predicted > 1;
    if (isNew) { newcomers++; }
    else if (Number.isFinite(err)) { if (err < 0.01) matched++; else maxErr = Math.max(maxErr, err); }
  }

  const onchain = (db.prepare(
    `SELECT COUNT(DISTINCT operator_address) AS c FROM validator_snapshots
      WHERE ts = (SELECT MAX(ts) FROM validator_snapshots) AND status = 'BOND_STATUS_BONDED'`
  ).get() as any)?.c ?? 0;

  return { cutoff, cutoffDelta, scored: rows.length, onchain, voted, zeroTiming,
           reconMatched: matched, reconTotal: rows.length - newcomers,
           reconMaxErr: maxErr, newcomers };
}

app.get("/", (_req, res) => {
  res.type("html").send(renderStandings(tiles()));
});

app.get("/methodology", (_req, res) => {
  res.type("html").send(renderMethodology(tiles()));
});

app.get("/v/:operator", (req, res) => {
  const op = String(req.params.operator);
  const v = db.prepare(
    `SELECT s.*, p.scoring_rate AS official_score, p.status AS official_status,
            p.status_reason AS official_status_reason,
            p.uptime_percentage_rate AS uptime_percentage_rate,
            json_extract(p.raw_json,'$.governanceParticipationRate') AS governance_participation_rate,
            json_extract(p.raw_json,'$.blockTimingScore') AS block_timing_score,
            json_extract(p.raw_json,'$.jailedCount') AS jailed_count
       FROM validator_snapshots s
       LEFT JOIN polli_snapshots p
         ON p.operator_address = s.operator_address
        AND p.ts = (SELECT MAX(ts) FROM polli_snapshots)
      WHERE s.operator_address = ?
      ORDER BY s.ts DESC LIMIT 1`
  ).get(op) as any;
  let jail: any[] = [];
  try {
    jail = db.prepare(
      `SELECT ts, jailed, jailed_until FROM validator_snapshots
        WHERE operator_address = ? AND jailed = 1 ORDER BY ts DESC LIMIT 20`
    ).all(op) as any[];
  } catch { /* jail history is a nicety, never a reason to 500 the page */ }
  res.type("html").send(renderValidator(v, jail));
});


/** Lava amounts arrive as integer ulava strings; the governance API exposes them
 *  in LAVA. Kept next to its only consumers. */
function ulavaToLava(ulava: string | number | null | undefined): number {
  const n = typeof ulava === "string" ? Number(ulava) : Number(ulava ?? 0);
  return Number.isFinite(n) ? n / 1e6 : 0;
}

app.get("/api/governance/proposals", (req: express.Request, res: express.Response) => {
  const status = req.query.status as string | undefined;
  const limit = parseInt((req.query.limit as string) || "100", 10);
  
  let query = `
    SELECT * FROM governance_proposals
    ${status ? "WHERE status = ?" : ""}
    ORDER BY proposal_id DESC
    LIMIT ?
  `;
  
  const params = status ? [status, limit] : [limit];
  const rows = db.prepare(query).all(...params) as any[];
  
  // Convert voting power from ulava to LAVA for display
  const proposals = rows.map(p => ({
    ...p,
    yes_votes_lava: ulavaToLava(p.yes_votes),
    no_votes_lava: ulavaToLava(p.no_votes),
    abstain_votes_lava: ulavaToLava(p.abstain_votes),
    no_with_veto_votes_lava: ulavaToLava(p.no_with_veto_votes),
    total_votes_lava: ulavaToLava(p.total_votes),
  }));
  
  res.json({
    ts: Date.now(),
    count: proposals.length,
    proposals,
  });
});

app.get("/api/governance/proposals/:id", (req: express.Request, res: express.Response) => {
  const proposalId = parseInt(req.params.id, 10);
  if (isNaN(proposalId)) {
    res.status(400).json({ error: "Invalid proposal ID" });
    return;
  }
  
  const proposal = db
    .prepare("SELECT * FROM governance_proposals WHERE proposal_id = ?")
    .get(proposalId) as any;
  
  if (!proposal) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }
  
  const votes = db
    .prepare(`
      SELECT * FROM governance_votes
      WHERE proposal_id = ?
      ORDER BY ts DESC
    `)
    .all(proposalId);
  
  // Convert voting power from ulava to LAVA for display
  const proposalWithLava = {
    ...proposal,
    yes_votes_lava: ulavaToLava(proposal.yes_votes),
    no_votes_lava: ulavaToLava(proposal.no_votes),
    abstain_votes_lava: ulavaToLava(proposal.abstain_votes),
    no_with_veto_votes_lava: ulavaToLava(proposal.no_with_veto_votes),
    total_votes_lava: ulavaToLava(proposal.total_votes),
  };
  
  res.json({
    proposal: proposalWithLava,
    votes,
    voteCount: votes.length,
  });
});

app.get("/api/governance/validators/:operator/votes", (req: express.Request, res: express.Response) => {
  const operator = req.params.operator;
  
  const votes = db
    .prepare(`
      SELECT v.*, p.title, p.status, p.voting_end_time
      FROM governance_votes v
      JOIN governance_proposals p ON v.proposal_id = p.proposal_id
      WHERE v.operator_address = ?
      ORDER BY v.proposal_id DESC
    `)
    .all(operator);
  
  res.json({
    ts: Date.now(),
    count: votes.length,
    votes,
  });
});

app.get("/api/governance/stats", (_req: express.Request, res: express.Response) => {
  const stats = db
    .prepare(`
      SELECT 
        COUNT(*) as total_proposals,
        COUNT(CASE WHEN status = 'PROPOSAL_STATUS_VOTING_PERIOD' THEN 1 END) as active_proposals,
        COUNT(CASE WHEN status = 'PROPOSAL_STATUS_PASSED' THEN 1 END) as passed,
        COUNT(CASE WHEN status = 'PROPOSAL_STATUS_REJECTED' THEN 1 END) as rejected,
        AVG(participation_rate) as avg_participation
      FROM governance_proposals
    `)
    .get();
  
  const validatorStats = db
    .prepare(`
      SELECT 
        COUNT(DISTINCT operator_address) as validators_voted,
        COUNT(*) as total_votes
      FROM governance_votes
    `)
    .get();
  
  res.json({
    ts: Date.now(),
    proposals: stats,
    validators: validatorStats,
  });
});

app.get("/governance", (_req: express.Request, res: express.Response) => {
  const rows = db.prepare(
    `SELECT proposal_id, title, status, voting_end_time,
            yes_count, no_count, abstain_count, no_with_veto_count
       FROM governance_proposals
      ORDER BY CAST(proposal_id AS INTEGER) DESC`
  ).all() as any[];
  const t = tiles();
  res.type("html").send(renderGovernance(rows, t.voted, t.scored));
});

app.get("/governance/proposal/:id", (req: express.Request, res: express.Response) => {
  const id = String(req.params.id);
  const p = db.prepare(
    `SELECT proposal_id, title, description, status, voting_end_time,
            yes_count, no_count, abstain_count, no_with_veto_count
       FROM governance_proposals WHERE proposal_id = ?`
  ).get(id) as any;
  let votes: any[] = [];
  try {
    votes = db.prepare(
      `SELECT voter, moniker, vote_option FROM governance_votes
        WHERE proposal_id = ? ORDER BY moniker`
    ).all(id) as any[];
  } catch { /* votes table may be empty; the page says so explicitly */ }
  res.type("html").send(renderProposal(p, id, p?.description || "", votes));
});


app.listen(CONFIG.port, "0.0.0.0", () => {
  console.log(`[api] listening on http://0.0.0.0:${CONFIG.port}`);
});


