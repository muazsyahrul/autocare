const express = require("express");
const cors    = require("cors");
const db      = require("./db");

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ─── Helper ───────────────────────────────────────────────────────────────────
const ok  = (res, data)         => res.json({ ok: true, data });
const err = (res, msg, status=400) => res.status(status).json({ ok: false, error: msg });

// ─── Vehicles ─────────────────────────────────────────────────────────────────
app.get("/api/vehicles", (req, res) => {
  const vehicles = db.prepare("SELECT * FROM vehicles ORDER BY id").all();
  // Attach last odometer (max of fuels + services)
  const result = vehicles.map(v => {
    const fOdo = db.prepare("SELECT MAX(odometer) as odo FROM fuels    WHERE vehicle_id=?").get(v.id)?.odo || 0;
    const sOdo = db.prepare("SELECT MAX(odometer) as odo FROM services WHERE vehicle_id=?").get(v.id)?.odo || 0;
    return { ...v, last_odometer: Math.max(fOdo, sOdo) || null };
  });
  ok(res, result);
});

app.post("/api/vehicles", (req, res) => {
  const { name, plate, year, color } = req.body;
  if (!name || !plate) return err(res, "name and plate are required");
  const r = db.prepare("INSERT INTO vehicles (name, plate, year, color) VALUES (?,?,?,?)").run(name, plate, year||2020, color||"#6366f1");
  ok(res, db.prepare("SELECT * FROM vehicles WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/vehicles/:id", (req, res) => {
  const { name, plate, year, color } = req.body;
  db.prepare("UPDATE vehicles SET name=?, plate=?, year=?, color=? WHERE id=?").run(name, plate, year, color, req.params.id);
  ok(res, db.prepare("SELECT * FROM vehicles WHERE id=?").get(req.params.id));
});

app.delete("/api/vehicles/:id", (req, res) => {
  db.prepare("DELETE FROM vehicles WHERE id=?").run(req.params.id);
  ok(res, { id: parseInt(req.params.id) });
});

// ─── Services ─────────────────────────────────────────────────────────────────
app.get("/api/services", (req, res) => {
  const { vehicle_id, type } = req.query;
  let q = "SELECT * FROM services WHERE 1=1";
  const p = [];
  if (vehicle_id) { q += " AND vehicle_id=?"; p.push(vehicle_id); }
  if (type)       { q += " AND type=?";       p.push(type); }
  q += " ORDER BY date DESC, id DESC";
  ok(res, db.prepare(q).all(...p));
});

app.post("/api/services", (req, res) => {
  const { vehicle_id, type, date, odometer, cost, workshop, notes } = req.body;
  if (!vehicle_id || !type || !date) return err(res, "vehicle_id, type, date required");
  const r = db.prepare(
    "INSERT INTO services (vehicle_id,type,date,odometer,cost,workshop,notes) VALUES (?,?,?,?,?,?,?)"
  ).run(vehicle_id, type, date, odometer||0, cost||0, workshop||"", notes||"");
  ok(res, db.prepare("SELECT * FROM services WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/services/:id", (req, res) => {
  const { type, date, odometer, cost, workshop, notes } = req.body;
  db.prepare("UPDATE services SET type=?,date=?,odometer=?,cost=?,workshop=?,notes=? WHERE id=?")
    .run(type, date, odometer, cost, workshop||"", notes||"", req.params.id);
  ok(res, db.prepare("SELECT * FROM services WHERE id=?").get(req.params.id));
});

app.delete("/api/services/:id", (req, res) => {
  db.prepare("DELETE FROM services WHERE id=?").run(req.params.id);
  ok(res, { id: parseInt(req.params.id) });
});

// ─── Fuels ────────────────────────────────────────────────────────────────────
app.get("/api/fuels", (req, res) => {
  const { vehicle_id } = req.query;
  let q = "SELECT * FROM fuels WHERE 1=1";
  const p = [];
  if (vehicle_id) { q += " AND vehicle_id=?"; p.push(vehicle_id); }
  q += " ORDER BY date DESC, id DESC";
  ok(res, db.prepare(q).all(...p));
});

app.post("/api/fuels", (req, res) => {
  const { vehicle_id, date, odometer, liters, price_per_l, cost, full } = req.body;
  if (!vehicle_id || !date) return err(res, "vehicle_id and date required");
  const r = db.prepare(
    "INSERT INTO fuels (vehicle_id,date,odometer,liters,price_per_l,cost,full) VALUES (?,?,?,?,?,?,?)"
  ).run(vehicle_id, date, odometer||0, liters||0, price_per_l||0, cost||0, full?1:0);
  ok(res, db.prepare("SELECT * FROM fuels WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/fuels/:id", (req, res) => {
  const { date, odometer, liters, price_per_l, cost, full } = req.body;
  db.prepare("UPDATE fuels SET date=?,odometer=?,liters=?,price_per_l=?,cost=?,full=? WHERE id=?")
    .run(date, odometer, liters, price_per_l, cost, full?1:0, req.params.id);
  ok(res, db.prepare("SELECT * FROM fuels WHERE id=?").get(req.params.id));
});

app.delete("/api/fuels/:id", (req, res) => {
  db.prepare("DELETE FROM fuels WHERE id=?").run(req.params.id);
  ok(res, { id: parseInt(req.params.id) });
});

// ─── Reminders ────────────────────────────────────────────────────────────────
app.get("/api/reminders", (req, res) => {
  const { vehicle_id } = req.query;
  let q = "SELECT * FROM reminders WHERE 1=1";
  const p = [];
  if (vehicle_id) { q += " AND vehicle_id=?"; p.push(vehicle_id); }
  q += " ORDER BY due_date ASC";
  ok(res, db.prepare(q).all(...p));
});

app.post("/api/reminders", (req, res) => {
  const { vehicle_id, type, due_date, due_odometer, notes, recur_type, recur_value, last_done_date, last_done_odo } = req.body;
  if (!vehicle_id || !type || !due_date) return err(res, "vehicle_id, type, due_date required");
  const r = db.prepare(
    "INSERT INTO reminders (vehicle_id,type,due_date,due_odometer,notes,recur_type,recur_value,last_done_date,last_done_odo) VALUES (?,?,?,?,?,?,?,?,?)"
  ).run(vehicle_id, type, due_date, due_odometer||null, notes||"", recur_type||"none", recur_value||null, last_done_date||null, last_done_odo||null);
  ok(res, db.prepare("SELECT * FROM reminders WHERE id=?").get(r.lastInsertRowid));
});

app.put("/api/reminders/:id", (req, res) => {
  const { type, due_date, due_odometer, notes, recur_type, recur_value, last_done_date, last_done_odo } = req.body;
  db.prepare("UPDATE reminders SET type=?,due_date=?,due_odometer=?,notes=?,recur_type=?,recur_value=?,last_done_date=?,last_done_odo=? WHERE id=?")
    .run(type, due_date, due_odometer||null, notes||"", recur_type||"none", recur_value||null, last_done_date||null, last_done_odo||null, req.params.id);
  ok(res, db.prepare("SELECT * FROM reminders WHERE id=?").get(req.params.id));
});

app.delete("/api/reminders/:id", (req, res) => {
  db.prepare("DELETE FROM reminders WHERE id=?").run(req.params.id);
  ok(res, { id: parseInt(req.params.id) });
});

// ─── Service Types ────────────────────────────────────────────────────────────
app.get("/api/service-types", (req, res) => {
  ok(res, db.prepare("SELECT * FROM service_types ORDER BY is_default DESC, name ASC").all());
});

app.post("/api/service-types", (req, res) => {
  const { name } = req.body;
  if (!name) return err(res, "name required");
  try {
    const r = db.prepare("INSERT INTO service_types (name, is_default) VALUES (?,0)").run(name.trim());
    ok(res, db.prepare("SELECT * FROM service_types WHERE id=?").get(r.lastInsertRowid));
  } catch {
    err(res, "Service type already exists");
  }
});

app.delete("/api/service-types/:id", (req, res) => {
  const t = db.prepare("SELECT * FROM service_types WHERE id=?").get(req.params.id);
  if (!t) return err(res, "Not found", 404);
  if (t.is_default) return err(res, "Cannot delete default service types");
  db.prepare("DELETE FROM service_types WHERE id=?").run(req.params.id);
  ok(res, { id: parseInt(req.params.id) });
});

// ─── Settings ─────────────────────────────────────────────────────────────────
app.get("/api/settings", (req, res) => {
  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  ok(res, settings);
});

app.put("/api/settings", (req, res) => {
  const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)");
  for (const [key, value] of Object.entries(req.body)) upsert.run(key, String(value));
  const rows = db.prepare("SELECT * FROM settings").all();
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  ok(res, settings);
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => ok(res, { status: "ok" }));

app.listen(PORT, () => console.log(`AutoCare API running on port ${PORT}`));
