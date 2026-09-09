import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const file = process.env.DB_PATH ?? resolve('server/data/app.sqlite')
mkdirSync(dirname(file), { recursive: true })

export const db = new DatabaseSync(file)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at TEXT
  );
  -- Legacy whole-account blob (schema v1). Kept for rollback; rows are migrated into the tables below on startup.
  CREATE TABLE IF NOT EXISTS user_data (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    snapshot TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    migrated_at TEXT
  );

  -- Schema v2: one row per record, owned by a user. Child rows cascade when their parent is deleted.
  CREATE TABLE IF NOT EXISTS subscriptions (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT NOT NULL,
    billing_cycle TEXT NOT NULL,
    next_renewal_date TEXT NOT NULL,
    start_date TEXT NOT NULL,
    status TEXT NOT NULL,
    payment_method TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    trial_ends_at TEXT,
    cancelled_at TEXT,
    reminder_days_before INTEGER,
    renewal_estimated INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS subscriptions_status_renewal ON subscriptions(user_id, status, next_renewal_date);

  CREATE TABLE IF NOT EXISTS price_changes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    subscription_id INTEGER NOT NULL,
    previous_amount REAL NOT NULL,
    new_amount REAL NOT NULL,
    effective_date TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, subscription_id) REFERENCES subscriptions(user_id, id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS price_changes_history ON price_changes(user_id, subscription_id, effective_date);

  CREATE TABLE IF NOT EXISTS cancellation_notes (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    subscription_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    content TEXT NOT NULL,
    remind_on TEXT,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id),
    FOREIGN KEY (user_id, subscription_id) REFERENCES subscriptions(user_id, id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS cancellation_notes_reminders ON cancellation_notes(user_id, status, remind_on);

  CREATE TABLE IF NOT EXISTS billing_events (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    plan TEXT NOT NULL,
    interval TEXT,
    amount REAL NOT NULL,
    occurred_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );

  CREATE TABLE IF NOT EXISTS renewal_checks (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id INTEGER NOT NULL,
    window_days INTEGER NOT NULL,
    period_start TEXT NOT NULL,
    period_end TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    decisions TEXT NOT NULL,
    summary TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS renewal_checks_recent ON renewal_checks(user_id, completed_at);

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    profile TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS analytics_events (
    day TEXT NOT NULL,
    event TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, event)
  );
  CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    settings TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`)

// Column additions for databases created before schema v2 (CREATE TABLE IF NOT EXISTS does not alter existing tables).
const columns = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
if (!columns('user_data').includes('migrated_at')) db.exec('ALTER TABLE user_data ADD COLUMN migrated_at TEXT')
