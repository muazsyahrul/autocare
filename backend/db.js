const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "data", "garage.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ───────────────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS vehicles (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    plate     TEXT    NOT NULL,
    year      INTEGER NOT NULL,
    color     TEXT    NOT NULL DEFAULT '#6366f1',
    created_at TEXT   DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS service_types (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL UNIQUE,
    is_default INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id  INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    type        TEXT    NOT NULL,
    date        TEXT    NOT NULL,
    odometer    INTEGER NOT NULL DEFAULT 0,
    cost        REAL    NOT NULL DEFAULT 0,
    workshop    TEXT    DEFAULT '',
    notes       TEXT    DEFAULT '',
    reminder_type TEXT   NOT NULL DEFAULT 'none',
    reminder_km INTEGER DEFAULT NULL,
    reminder_months INTEGER DEFAULT NULL,
    created_at  TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fuels (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id   INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    date         TEXT    NOT NULL,
    odometer     INTEGER NOT NULL DEFAULT 0,
    liters       REAL    NOT NULL DEFAULT 0,
    price_per_l  REAL    NOT NULL DEFAULT 0,
    cost         REAL    NOT NULL DEFAULT 0,
    full         INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reminders (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    vehicle_id     INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    type           TEXT    NOT NULL,
    due_date       TEXT    NOT NULL,
    due_odometer   INTEGER DEFAULT NULL,
    notes          TEXT    DEFAULT '',
    recur_type     TEXT    NOT NULL DEFAULT 'none',
    recur_value    INTEGER DEFAULT NULL,
    last_done_date TEXT    DEFAULT NULL,
    last_done_odo  INTEGER DEFAULT NULL,
    source_service_id INTEGER DEFAULT NULL,
    reminder_type TEXT NOT NULL DEFAULT 'legacy',
    interval_km INTEGER DEFAULT NULL,
    interval_months INTEGER DEFAULT NULL,
    created_at     TEXT    DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// ─── Safe migrations for existing databases ──────────────────────────────────
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumnIfMissing("services", "reminder_type", "TEXT NOT NULL DEFAULT 'none'");
addColumnIfMissing("services", "reminder_km", "INTEGER DEFAULT NULL");
addColumnIfMissing("services", "reminder_months", "INTEGER DEFAULT NULL");
addColumnIfMissing("reminders", "source_service_id", "INTEGER DEFAULT NULL");
addColumnIfMissing("reminders", "reminder_type", "TEXT NOT NULL DEFAULT 'legacy'");
addColumnIfMissing("reminders", "interval_km", "INTEGER DEFAULT NULL");
addColumnIfMissing("reminders", "interval_months", "INTEGER DEFAULT NULL");

db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_source_service ON reminders(source_service_id)`);

// ─── Seed default service types ───────────────────────────────────────────────
const defaults = [
  "Oil Change",
  "Oil Filter",
  "Air Filter",
  "Cabin Air Filter",
  "Coolant",
  "Brake Fluid",
  "Brake Pads",
  "Spark Plugs",
  "Battery",
  "Transmission Oil",
  "CVT Oil",
  "Fuel Filter",
  "Tyre Rotation",
  "Tyre Repair / Fix",
  "Wheel Alignment",
  "Wheel Balancing",
  "Wiper",
  "Timing Belt",
  "Aircon Filter",
  "Aircon Gas"
];

const insertType = db.prepare(
  "INSERT OR IGNORE INTO service_types (name, is_default) VALUES (?, 1)"
);
for (const name of defaults) insertType.run(name);

// ─── Seed default settings ────────────────────────────────────────────────────
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("fuel_price_per_l", "2.24");

module.exports = db;
