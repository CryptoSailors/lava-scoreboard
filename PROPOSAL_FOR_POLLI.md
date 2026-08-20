# CryptoSailors — Lava Scoreboard & Governance Tracker

**Contact:** CryptoSailors (Lava validator `lava@valoper1mxh36wxdzxjhg8zqjwm7949avzzamfkukf2e9j`)
**Repository:** https://github.com/CryptoSailors/lava-scoreboard (MIT)
**Live dashboard:** https://lava-dashboard.cryptosailors.dev

---

## Why we're writing

Two things:

1. We'd like to be considered for the **Contribution-Based Delegation track** — we operate a
   public dashboard for the Lava validator set, which is one of the categories the program
   names explicitly ("explorers, dashboards, and relayers").
2. We have a concrete question about `blockTimingScore` that we could not answer from public
   sources, and we believe the answer would help more operators than just us.

---

## What we run

A validator scoring and governance dashboard for Lava mainnet. Node.js + TypeScript + SQLite,
open source under MIT, deployed on our own validator infrastructure.

**Validator metrics.** Snapshots of the full active set, with per-validator history so changes
over time are visible rather than only the current value.

**Governance tracker.** All proposals, per-validator voting records, and participation rates —
so "who actually votes" is answerable at a glance.

**Signing quality, measured from the chain.** We measure each validator's signing behaviour by
reading commits directly, distinguishing:
- `ABSENT` (flag 1) — the vote is missing from the commit;
- `NIL` (flag 3) — the validator voted, but not for that block;
- and, for every signed block, its **position in the signing order**, derived from signature
  timestamps.

The last one turned out to be the most useful signal we have: misses are rare and noisy, but
signing position exists in *every* signed block, which makes propagation regressions visible
within hours instead of days.

**REST API.** `/api/validators`, `/api/governance/proposals`, `/api/governance/stats`,
`/api/delegation/snapshots`.

---

## Two findings we think are worth sharing

### 1. The scoring formula is exactly reproducible

Working from the public API response, we found that the published score is reproduced by:

```
score = 35 + 0.20*uptime + 0.15*governanceParticipation + 0.30*blockTiming - 1.75*jailedCount
```

Checked against the full active set (74 validators): the residual is **0.0000 for 73 of them**.

We're sharing this because it is useful to operators, and because if it's accurate we'd be glad
to see it stated somewhere official — right now every operator has to rediscover it.

### 2. `blockTimingScore` is not documented anywhere we could find, and it decides the outcome

This is our actual question.

- **It is effectively mandatory.** Of the 26 validators currently receiving performance-track
  delegation, **0 have `blockTimingScore = 0`**.
- **Its absence is decisive.** Without it, the arithmetic ceiling is `35 + 20 + 15 = 70.00`.
  The lowest score among current recipients is **71.58**. So a validator with perfect uptime
  and perfect governance participation still cannot reach the threshold.
- **It behaves as present/absent, not as a scale.** Across the set, values are either exactly
  `0` (16 validators) or between `40` and `70` (58 validators). Nothing in between.

We tried to work out what drives it, and can rule out several plausible explanations:

| hypothesis | why it fails |
|---|---|
| it reflects uptime | a validator at **70.5%** uptime has `blockTiming > 0`; ours at **98.5%** is `0` |
| it needs a minimum stake | validators with **153** and **602** LAVA have `51.5` and `57.4`; ours with **2,402** LAVA is `0`, and one with **7,595** LAVA is also `0` |
| it needs proposed blocks | four validators with `blockTiming` between 51 and 60 proposed **zero** blocks in a 20,000-block window we scanned |
| commission / status / age | recipients include 20% commission, `NOT_RECOMMENDED` status, and all validators in the set show `operationDays: 90` |

We also checked the public documentation, including docs.polli.co and the delegation program
announcement. The announcement mentions "block production compliance" as a *future* metric
without defining it; we could not find a definition of `blockTimingScore` anywhere.

**Our question is simply: what does `blockTimingScore` measure, and what would make it non-zero
for a validator like ours?** If there's a configuration or registration step we're missing,
we'll do it. If it's structural, knowing that is equally valuable — it would stop operators
from optimising things that cannot move it.

---

## What we're offering

We're happy to:

- keep the dashboard running publicly for the community;
- publish the scoring formula and the signing-quality methodology as documentation, if useful;
- add any metric the program would like operators to see;
- hand over or mirror the data if Polli or Lava would rather host it.

## About our validator

- Lava mainnet, `lava@valoper1mxh36wxdzxjhg8zqjwm7949avzzamfkukf2e9j`
- We also run Axelar mainnet (with `tmkms` remote signing on a separate host) and CrossFi
- Uptime 98.5%, no slashing events, `jailedCount: 0`
- We're a small operator — 2,402 LAVA of stake — which is precisely why the performance track
  is out of reach for us, and why the contribution track is what we're asking about
