PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS validator_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  operator_address TEXT NOT NULL,
  moniker TEXT NOT NULL,
  status TEXT NOT NULL,
  jailed INTEGER NOT NULL,
  tokens TEXT NOT NULL,
  commission_rate TEXT NOT NULL,
  commission_max_rate TEXT NOT NULL,
  commission_max_change_rate TEXT NOT NULL,
  missed_blocks_counter INTEGER NOT NULL,
  signed_blocks_window INTEGER NOT NULL,
  jailed_until TEXT,
  tombstoned INTEGER NOT NULL,
  score REAL NOT NULL,
  polli_score REAL,
  polli_eligible INTEGER,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_validator_snapshots_operator_ts
  ON validator_snapshots(operator_address, ts DESC);

CREATE INDEX IF NOT EXISTS idx_validator_snapshots_ts
  ON validator_snapshots(ts DESC);

CREATE TABLE IF NOT EXISTS polli_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  operator_address TEXT NOT NULL,
  moniker TEXT NOT NULL,
  status TEXT NOT NULL,
  status_reason TEXT,
  scoring_rate REAL NOT NULL,
  voting_power TEXT,
  commission_rate REAL,
  validator_apr REAL,
  network_apr REAL,
  total_staked_tokens TEXT,
  uptime_percentage_rate REAL,
  uptime_rate_last_window REAL,
  slash_count INTEGER,
  last_jailed_recover TEXT,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_polli_snapshots_operator_ts
  ON polli_snapshots(operator_address, ts DESC);

CREATE INDEX IF NOT EXISTS idx_polli_snapshots_ts
  ON polli_snapshots(ts DESC);

CREATE TABLE IF NOT EXISTS delegation_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_date TEXT NOT NULL,
  ts INTEGER NOT NULL,
  operator_address TEXT NOT NULL,
  moniker TEXT NOT NULL,
  status TEXT NOT NULL,
  jailed INTEGER NOT NULL,
  tokens TEXT NOT NULL,
  commission_rate TEXT NOT NULL,
  missed_blocks_counter INTEGER NOT NULL,
  signed_blocks_window INTEGER NOT NULL,
  jailed_until TEXT,
  tombstoned INTEGER NOT NULL,
  score REAL NOT NULL,
  polli_score REAL,
  polli_eligible INTEGER,
  missed_blocks_21d INTEGER,
  slashes_21d INTEGER,
  uptime_21d REAL,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_delegation_snapshots_date
  ON delegation_snapshots(snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_delegation_snapshots_operator
  ON delegation_snapshots(operator_address, snapshot_date DESC);

-- Governance tables
CREATE TABLE IF NOT EXISTS governance_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  submit_time TEXT NOT NULL,
  deposit_end_time TEXT,
  voting_start_time TEXT,
  voting_end_time TEXT,
  total_deposit TEXT,
  yes_count TEXT DEFAULT '0',
  abstain_count TEXT DEFAULT '0',
  no_count TEXT DEFAULT '0',
  no_with_veto_count TEXT DEFAULT '0',
  yes_votes TEXT DEFAULT '0',
  abstain_votes TEXT DEFAULT '0',
  no_votes TEXT DEFAULT '0',
  no_with_veto_votes TEXT DEFAULT '0',
  total_votes TEXT DEFAULT '0',
  participation_rate REAL DEFAULT 0,
  ts INTEGER NOT NULL,
  raw_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_governance_proposals_id
  ON governance_proposals(proposal_id DESC);

CREATE INDEX IF NOT EXISTS idx_governance_proposals_status
  ON governance_proposals(status, ts DESC);

CREATE TABLE IF NOT EXISTS governance_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id INTEGER NOT NULL,
  operator_address TEXT NOT NULL,
  moniker TEXT,
  vote_option TEXT NOT NULL,
  tx_hash TEXT,
  ts INTEGER NOT NULL,
  raw_json TEXT,
  UNIQUE(proposal_id, operator_address)
);

CREATE INDEX IF NOT EXISTS idx_governance_votes_proposal
  ON governance_votes(proposal_id, operator_address);

CREATE INDEX IF NOT EXISTS idx_governance_votes_operator
  ON governance_votes(operator_address, ts DESC);


