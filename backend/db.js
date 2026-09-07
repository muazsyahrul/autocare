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

  CREATE TABLE IF NOT EXISTS service_categories (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS service_types (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    category_id INTEGER NOT NULL DEFAULT 1
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
addColumnIfMissing("service_types","category_id","INTEGER NOT NULL DEFAULT 1");

db.exec(`CREATE INDEX IF NOT EXISTS idx_reminders_source_service ON reminders(source_service_id)`);

// ─── Fixed service categories ────────────────────────────────────────────────
const categories = [
  "Engine & Oil",
  "Transmission",
  "Cooling System",
  "Air Conditioning",
  "Brakes",
  "Suspension & Steering",
  "Tyres & Alignment",
  "Battery & Electrical",
  "Fuel System",
  "Engine Intake & Exhaust",
  "Belts & Timing",
  "Lights",
  "Wipers & Washer",
  "Body & Exterior",
  "Interior",
  "General Maintenance",
  "Parts & Accessories",
  "Legal & Insurance",
  "Other"
];

const insertCategory = db.prepare(`
  INSERT OR IGNORE INTO service_categories (name, sort_order)
  VALUES (?, ?)
`);

categories.forEach((name, index) => {
  insertCategory.run(name, index + 1);
});

// ─── Assign existing service types to a category ─────────────────────────────
const categoryMap = {
  "Oil Change": "Engine & Oil",
  "Oil Filter": "Engine & Oil",
  "Oil Sump": "Engine & Oil",
  "Dipstick": "Engine & Oil",
  "Gasket": "Engine & Oil",

  "Transmission": "Transmission",
  "Transmission Oil": "Transmission",
  "Transmission Oil CVT": "Transmission",
  "Transmission Treatment Oil": "Transmission",
  "Filter Auto CVT": "Transmission",
  "Gasket CVT": "Transmission",
  "CVT Adaptation": "Transmission",

  "Coolant": "Cooling System",
  "Radiator": "Cooling System",
  "Radiator Cap": "Cooling System",
  "Radiator Fan Motor": "Cooling System",
  "Thermostat": "Cooling System",
  "Water Pump": "Cooling System",

  "Aircon Blower Motor": "Air Conditioning",
  "Aircon Compressor": "Air Conditioning",
  "Aircon Compressor Oil": "Air Conditioning",
  "Aircon Cooling Coil": "Air Conditioning",
  "Aircon Evaporator Coil": "Air Conditioning",
  "Aircon Expansion Valve": "Air Conditioning",
  "Aircon Filter": "Air Conditioning",
  "Aircon Gas": "Air Conditioning",
  "Aircon Pipe": "Air Conditioning",
  "Aircon Receiver Drier": "Air Conditioning",

  "Break Pad": "Brakes",
  "Brake Pad": "Brakes",
  "Break Shoe": "Brakes",
  "Break Wheel Cylinder": "Brakes",
  "Brake Fluid": "Brakes",
  "Brake Master Pump": "Brakes",
  "Brake Lights": "Brakes",

  "Absorber": "Suspension & Steering",
  "Absorber Mounting": "Suspension & Steering",
  "Lower Arm": "Suspension & Steering",
  "Mounting": "Suspension & Steering",
  "Stabilizer Link": "Suspension & Steering",
  "Suspension Link": "Suspension & Steering",
  "Steering Bush": "Suspension & Steering",
  "Power Steering": "Suspension & Steering",
  "Power Steering Fluid": "Suspension & Steering",
  "Power Steering Tabung": "Suspension & Steering",

  "Tire": "Tyres & Alignment",
  "Tire fix": "Tyres & Alignment",
  "Rotate Tires": "Tyres & Alignment",
  "Tyre Rotation": "Tyres & Alignment",
  "Alignment": "Tyres & Alignment",
  "Alignment & Balancing": "Tyres & Alignment",
  "Balancing": "Tyres & Alignment",
  "Camber": "Tyres & Alignment",

  "Battery": "Battery & Electrical",
  "Battery Check": "Battery & Electrical",
  "Battery Terminal Protector": "Battery & Electrical",
  "Battery Water 1L": "Battery & Electrical",
  "Starter": "Battery & Electrical",
  "Relay Starter": "Battery & Electrical",
  "ICM Relay": "Battery & Electrical",

  "Fuel Filter": "Fuel System",
  "Fuel Injector - Optional": "Fuel System",
  "Fuel Pump Assembly": "Fuel System",
  "Fuel Pump Motor": "Fuel System",
  "Injector Cleaner": "Fuel System",

  "Air Filter": "Engine Intake & Exhaust",
  "Airflow Inlet Manifold": "Engine Intake & Exhaust",
  "Throttle Body Cleaner (100ml)": "Engine Intake & Exhaust",
  "Exhaust": "Engine Intake & Exhaust",

  "Timing Belt": "Belts & Timing",
  "Timing Belts": "Belts & Timing",
  "Belt": "Belts & Timing",
  "Bearing": "Belts & Timing",
  "Bearing: Tensioner Bearing": "Belts & Timing",
  "Seal Belt Cover": "Belts & Timing",

  "Headlights": "Lights",
  "Fog Lights": "Lights",
  "Tail Lights": "Lights",
  "Lampu Boot": "Lights",
  "Cabin Lights": "Lights",

  "Windshield Wipers": "Wipers & Washer",
  "Wiper Water Pump": "Wipers & Washer",
  "Front Wiper Nozzle": "Wipers & Washer",

  "Bodyworks": "Body & Exterior",
  "Tinted": "Body & Exterior",
  "Rear View Mirror": "Body & Exterior",
  "Headlight Housing": "Body & Exterior",
  "Trunk Lid Garnish": "Body & Exterior",
  "Windshield-Front": "Body & Exterior",

  "Carpet": "Interior",
  "Glove Box Latch": "Interior",
  "Getah Pintu": "Interior",
  "Door sensor": "Interior",

  "Engine Flushing - Optional": "General Maintenance",
  "Workmanship": "General Maintenance",
  "Updated Mileage": "General Maintenance",

  "Plate": "Parts & Accessories",

  "Insurance": "Legal & Insurance",
  "Roadtax": "Legal & Insurance",
  "Tax": "Legal & Insurance"
};

const getCategory = db.prepare(
  "SELECT id FROM service_categories WHERE name=?"
);

const updateTypeCategory = db.prepare(
  "UPDATE service_types SET category_id=? WHERE name=?"
);

for (const [typeName, categoryName] of Object.entries(categoryMap)) {
  const category = getCategory.get(categoryName);

  if (category) {
    updateTypeCategory.run(category.id, typeName);
  }
}

// ─── Seed default settings ────────────────────────────────────────────────────
db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run("fuel_price_per_l", "2.24");

module.exports = db;
