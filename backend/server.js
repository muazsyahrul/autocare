const express = require("express");
const cors    = require("cors");
const db      = require("./db");
const crypto  = require("crypto");

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// ─── Helper ───────────────────────────────────────────────────────────────────
const ok  = (res, data)         => res.json({ ok: true, data });
const err = (res, msg, status=400) => res.status(status).json({ ok: false, error: msg });

// ─── Authentication ───────────────────────────────────────────────────────────
const AUTH_USERNAME = process.env.AUTOCARE_USERNAME || "admin";
const AUTH_PASSWORD = process.env.AUTOCARE_PASSWORD || "autocare123";
const SESSION_DAYS = Number(process.env.AUTOCARE_SESSION_DAYS || 30);
const SESSION_MS = (Number.isFinite(SESSION_DAYS) && SESSION_DAYS > 0 ? SESSION_DAYS : 30) * 24 * 60 * 60 * 1000;
const SESSION_COOKIE = "autocare_session";
const sessions = new Map();

function createSession() {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, Date.now() + SESSION_MS);
  return token;
}

function getSessionToken(req) {
  const cookieHeader = req.headers.cookie || "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  if (!match) return null;
  const token = match[1];
  const expiresAt = sessions.get(token);
  if (!expiresAt) return null;
  if (expiresAt <= Date.now()) { sessions.delete(token); return null; }
  return token;
}

function requireAuth(req, res, next) {
  if (getSessionToken(req)) return next();
  return err(res, "Authentication required", 401);
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(SESSION_MS / 1000)}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

app.post("/api/auth/login", (req, res) => {
  const username = String(req.body?.username || "");
  const password = String(req.body?.password || "");
  if (username !== AUTH_USERNAME || password !== AUTH_PASSWORD) return err(res, "Invalid username or password", 401);
  const token = createSession();
  setSessionCookie(res, token);
  return ok(res, { username: AUTH_USERNAME, session_days: SESSION_DAYS });
});

app.get("/api/auth/me", (req, res) => {
  if (!getSessionToken(req)) return err(res, "Not authenticated", 401);
  return ok(res, { username: AUTH_USERNAME });
});

app.post("/api/auth/logout", (req, res) => {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  clearSessionCookie(res);
  return ok(res, true);
});

// Everything below this point requires a valid login.
app.use("/api", requireAuth);

// ─── Vehicles ─────────────────────────────────────────────────────────────────
app.get("/api/vehicles", (req, res) => {
  const vehicles = db.prepare("SELECT * FROM vehicles ORDER BY id").all();
  // Attach last odometer (max of fuels + services)
  const result = vehicles.map(v => {
    const fOdo = Number(db.prepare("SELECT MAX(odometer) as odo FROM fuels WHERE vehicle_id=?").get(v.id)?.odo) || 0;
    const sOdo = Number(db.prepare("SELECT MAX(odometer) as odo FROM services WHERE vehicle_id=?").get(v.id)?.odo) || 0;
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
function positiveInt(value) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function calcNextDueDate(dateStr, months) {
  if (!dateStr || !months) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

function normalizeReminder(service) {
  const type = ["none", "mileage", "schedule", "both"].includes(service.reminder_type)
    ? service.reminder_type : "none";
  const km = positiveInt(service.reminder_km);
  const months = positiveInt(service.reminder_months);
  if (type === "mileage" && !km) return { type:"none", km:null, months:null };
  if (type === "schedule" && !months) return { type:"none", km:null, months:null };
  if (type === "both" && !km && !months) return { type:"none", km:null, months:null };
  return { type, km: type === "schedule" ? null : km, months: type === "mileage" ? null : months };
}

function deleteReminderForService(serviceId) {
  db.prepare("DELETE FROM reminders WHERE source_service_id=?").run(serviceId);
}

function clearActiveReminders(vehicleId, type, exceptServiceId = null) {
  if (exceptServiceId) {
    db.prepare("DELETE FROM reminders WHERE vehicle_id=? AND type=? AND (source_service_id IS NULL OR source_service_id<>?)")
      .run(vehicleId, type, exceptServiceId);
  } else {
    db.prepare("DELETE FROM reminders WHERE vehicle_id=? AND type=?").run(vehicleId, type);
  }
}

function createReminderForService(service, clearExisting = true) {
  deleteReminderForService(service.id);
  const cfg = normalizeReminder(service);
  if (cfg.type === "none") return null;

  // A new service fulfills any previous active reminder for this car/service type.
  if (clearExisting) clearActiveReminders(service.vehicle_id, service.type, service.id);

  const dueDate = cfg.months
    ? calcNextDueDate(service.date, cfg.months)
    : "9999-12-31";
  const dueOdo = cfg.km && Number(service.odometer) > 0
    ? Number(service.odometer) + cfg.km
    : null;

  const r = db.prepare(`
    INSERT INTO reminders
      (vehicle_id,type,due_date,due_odometer,notes,recur_type,recur_value,
       last_done_date,last_done_odo,source_service_id,reminder_type,interval_km,interval_months)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    service.vehicle_id,
    service.type,
    dueDate,
    dueOdo,
    service.notes || "",
    cfg.type,
    cfg.type === "mileage" ? cfg.km : cfg.type === "schedule" ? cfg.months : null,
    service.date,
    Number(service.odometer) || null,
    service.id,
    cfg.type,
    cfg.km,
    cfg.months
  );
  return db.prepare("SELECT * FROM reminders WHERE id=?").get(r.lastInsertRowid);
}

function rebuildLatestReminder(vehicleId, type) {
  db.prepare("DELETE FROM reminders WHERE vehicle_id=? AND type=?").run(vehicleId, type);
  const latest = db.prepare(`
    SELECT * FROM services
    WHERE vehicle_id=? AND type=?
    ORDER BY date DESC, id DESC LIMIT 1
  `).get(vehicleId, type);
  if (!latest) return null;
  return createReminderForService(latest, false);
}

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
  const { vehicle_id, type, date, odometer, cost, workshop, notes, reminder_type, reminder_km, reminder_months } = req.body;
  if (!vehicle_id || !type || !date) return err(res, "vehicle_id, type, date required");

  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO services
        (vehicle_id,type,date,odometer,cost,workshop,notes,reminder_type,reminder_km,reminder_months)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      vehicle_id, type, date, Number(odometer)||0, Number(cost)||0, workshop||"", notes||"",
      reminder_type || "none", positiveInt(reminder_km), positiveInt(reminder_months)
    );
    const service = db.prepare("SELECT * FROM services WHERE id=?").get(r.lastInsertRowid);
    const reminder = rebuildLatestReminder(service.vehicle_id, service.type);
    return { service, reminder };
  });

  try { ok(res, tx()); }
  catch (e) { err(res, e.message); }
});

app.put("/api/services/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare("SELECT * FROM services WHERE id=?").get(id);
  if (!existing) return err(res, "Service not found", 404);

  const { type, date, odometer, cost, workshop, notes, reminder_type, reminder_km, reminder_months } = req.body;
  if (!type || !date) return err(res, "type and date required");

  const tx = db.transaction(() => {
    // Remove the old generated reminder. After the edit, rebuild the reminder
    // for the latest service in each affected car/type bucket.
    deleteReminderForService(id);

    db.prepare(`
      UPDATE services
      SET type=?,date=?,odometer=?,cost=?,workshop=?,notes=?,reminder_type=?,reminder_km=?,reminder_months=?
      WHERE id=?
    `).run(
      type, date, Number(odometer)||0, Number(cost)||0, workshop||"", notes||"",
      reminder_type || "none", positiveInt(reminder_km), positiveInt(reminder_months), id
    );

    const service = db.prepare("SELECT * FROM services WHERE id=?").get(id);
    let reminder;
    if (existing.vehicle_id === service.vehicle_id && existing.type === service.type) {
      reminder = rebuildLatestReminder(service.vehicle_id, service.type);
    } else {
      rebuildLatestReminder(existing.vehicle_id, existing.type);
      reminder = rebuildLatestReminder(service.vehicle_id, service.type);
    }
    return { service, reminder };
  });

  try { ok(res, tx()); }
  catch (e) { err(res, e.message); }
});

app.delete("/api/services/:id", (req, res) => {
  const id = parseInt(req.params.id, 10);
  const service = db.prepare("SELECT * FROM services WHERE id=?").get(id);
  if (!service) return err(res, "Service not found", 404);

  const tx = db.transaction(() => {
    deleteReminderForService(id);
    db.prepare("DELETE FROM services WHERE id=?").run(id);

    // If the deleted service was the latest service for this car/type, restore
    // the reminder generated by the previous service, if that service had one.
    const previous = db.prepare(`
      SELECT * FROM services
      WHERE vehicle_id=? AND type=?
      ORDER BY date DESC, id DESC LIMIT 1
    `).get(service.vehicle_id, service.type);
    if (previous) createReminderForService(previous);
  });

  try { tx(); ok(res, { id }); }
  catch (e) { err(res, e.message); }
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
  let q = `
    SELECT r.*,
      COALESCE((SELECT MAX(f.odometer) FROM fuels f WHERE f.vehicle_id=r.vehicle_id), 0) AS fuel_odometer,
      COALESCE((SELECT MAX(s.odometer) FROM services s WHERE s.vehicle_id=r.vehicle_id), 0) AS service_odometer
    FROM reminders r
    WHERE 1=1
  `;
  const p = [];
  if (vehicle_id) { q += " AND r.vehicle_id=?"; p.push(vehicle_id); }
  q += " ORDER BY r.due_date ASC, r.due_odometer ASC";
  const rows = db.prepare(q).all(...p).map(r => ({
    ...r,
    // Current mileage is the highest odometer entered in either fuel or service records.
    // This makes mileage reminders react immediately after a fuel fill-up.
    current_odometer: Math.max(Number(r.fuel_odometer)||0, Number(r.service_odometer)||0) || null,
  }));
  ok(res, rows);
});

// Reminders are derived from service records. They cannot be created manually.
app.post("/api/reminders", (req, res) => {
  return err(res, "Reminders are created automatically from service records", 405);
});

app.put("/api/reminders/:id", (req, res) => {
  return err(res, "Reminders are managed automatically from service records", 405);
});

app.delete("/api/reminders/:id", (req, res) => {
  return err(res, "Reminders are managed automatically from service records", 405);
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
