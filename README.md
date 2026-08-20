# Lava Scoreboard

Polli's official Lava validator score, taken apart into the components it is made of.

**Live:** <https://lava-dashboard.cryptosailors.dev>

Polli publishes a score for every Lava validator, and the Lava Foundation delegates on that
score. It also publishes the fields the score is built from — but not the arithmetic that joins
them. So an operator can see that they scored 54.7 and cannot see which component cost them the
delegated set.

This service reconstructs the formula and shows the parts:

```
score = 35
      + 0.20 × uptimePercentageRate
      + 0.15 × governanceParticipationRate
      + 0.30 × blockTimingScore
      − 1.75 × jailedCount
```

The reconstruction is checked against Polli's published total on every render. It currently
matches for 73 of 74 validators, with a maximum error of 0.001.

We run this as the operator **CryptoSailors**. We rank near the bottom of our own board and the
page says so — no highlighting, no reordering, no second score of ours to flatter the comparison.

## What it does

- **Standings** — every validator ranked by the official score, each row showing the score broken
  into base / uptime / governance / block timing / jail penalty, with the top-25 delegation line
  drawn as a real row.
- **Validator detail** — the same decomposition full size, plus raw inputs and jail history.
- **Governance** — proposals and tallies. Participation is worth 15 points and is binary.
- **Methodology** — the formula, how it was derived, and an honest account of the one component
  nobody has been able to explain (see below).

## `blockTimingScore`

It carries 30 of the 100 points — more than any other component — and 16 of 74 validators score
exactly zero on it. We could not find a definition in Polli's documentation or in the Lava
delegation programme announcement, and we ruled out the obvious explanations against live data:
it does not track uptime, it is not a stake threshold, and it does not require proposing blocks.
If you know what it measures, please open an issue.

## Running it

Requires Node.js 20+ and a reachable Lava RPC (your own node, or any node you trust).

```bash
npm ci
cp -n env.example .env      # then edit .env
npm run build
npm start                   # dashboard + API on $PORT
```

Collectors run as separate processes; `pm2.config.cjs` starts all of them:

| Process | What it does |
|---|---|
| `server.js` | dashboard and JSON API |
| `collector.js` | validator snapshots from `lavad` |
| `polliCollector.js` | snapshots of Polli's public API |
| `governanceCollector.js` | proposals and, while they are open, votes |
| `prune.js` | retention — run from cron, not a daemon |

Two settings fail silently if you get them wrong, so they are worth checking twice:

- **`LAVA_RPC`** — 26657 is the CometBFT default and is what Axelar uses; Lava may not be there.
  Point it at the wrong port and everything keeps running while no new data arrives.
- **`BLOCK_TIME_SEC`** — a non-numeric value makes derived uptime `NaN`, and every validator
  quietly scores zero while the logs stay green.

### Retention

Nothing here deleted a row for the first seven months, and the database reached 6.1 GB across
3.0M rows. `prune.js` thins rather than truncates: everything inside `--days` (default 14) is
kept as is, and beyond that one snapshot per validator per day survives, with each validator's
oldest row never removed so baselines stay reachable.

```bash
node dist/prune.js --dry-run      # show what would go
node dist/prune.js --days=14      # nightly, from cron
```

It deletes in batches with pauses: a single large delete measurably raises fsync latency for
everything else on the host. `VACUUM` is not run by default for the same reason.

## API

| Endpoint | Returns |
|---|---|
| `GET /api/validators?polli=true` | latest snapshot per validator, with Polli's score and its components |
| `GET /api/validators/:operator` | one validator |
| `GET /api/validators/:operator/jail-history` | jail events |
| `GET /api/governance/proposals` | proposals |
| `GET /api/governance/stats` | participation summary |
| `GET /api/polli/diff` | rank and score movement between the two most recent snapshots |

## Notes

- Per-validator voting records exist only while a proposal is open: Cosmos removes individual
  votes from state once a proposal is finalised, so history cannot be rebuilt from a pruned node.
- The dashboard reads only public sources — Polli's public API and a public Lava RPC.
- Do not expose your node's RPC or keyring alongside this. It queries `lavad` read-only and needs
  nothing else.

## Licence

MIT. See [LICENSE](LICENSE).
