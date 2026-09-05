import { useState, useEffect, useMemo, useCallback } from "react";
import { api } from "./api.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TODAY = new Date();

function getDaysUntil(dateStr) {
  return Math.ceil((new Date(dateStr) - TODAY) / 86400000);
}
function urgencyColor(days) {
  if (days < 0)   return "#ef4444";
  if (days <= 14) return "#f97316";
  if (days <= 30) return "#eab308";
  return "#22c55e";
}
function urgencyLabel(days) {
  if (days < 0)   return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}
function calcNextDueDate(lastDoneDate, months) {
  if (!lastDoneDate || !months) return null;
  const d = new Date(lastDoneDate);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

// ─── Theme ────────────────────────────────────────────────────────────────────
const BG     = "#0a0f1e";
const SURF   = "#111827";
const CARD   = "#1e293b";
const BORDER = "#1e3a5f";
const ACCENT = "#38bdf8";
const TEXT   = "#f1f5f9";
const MUTED  = "#849fc3";
const SUBTLE = "#94a3b8";

const IS = {
  width: "100%", background: "#0f172a", border: "1px solid #334155",
  borderRadius: 8, color: TEXT, padding: "10px 12px", fontSize: 14,
  boxSizing: "border-box", outline: "none",
};

// ─── UI primitives ────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.75)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}>
      <div style={{ background:CARD, border:`1px solid #334155`, borderRadius:16, width:"100%", maxWidth:480, maxHeight:"90vh", overflowY:"auto", padding:24 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <h2 style={{ color:TEXT, fontSize:18, fontWeight:700, margin:0 }}>{title}</h2>
          <button onClick={onClose} style={{ background:"none", border:"none", color:MUTED, fontSize:24, cursor:"pointer", lineHeight:1 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FF({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:"block", color:SUBTLE, fontSize:12, fontWeight:600, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label}</label>
      {children}
    </div>
  );
}

function Btn({ label, onClick, variant="primary", disabled=false }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ padding:"10px 18px", borderRadius:10, border:"none", cursor:disabled?"not-allowed":"pointer", fontWeight:700, fontSize:13, opacity:disabled?0.5:1,
        background: variant==="primary" ? ACCENT : variant==="danger" ? "#ef444422" : CARD,
        color:       variant==="primary" ? "#0a0f1e" : variant==="danger" ? "#ef4444" : TEXT }}>
      {label}
    </button>
  );
}

function SecTitle({ t }) {
  return <div style={{ fontSize:13, color:MUTED, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{t}</div>;
}

function Spinner() {
  return <div style={{ color:MUTED, textAlign:"center", padding:40, fontSize:14 }}>Loading...</div>;
}

// ─── Service Type Picker ──────────────────────────────────────────────────────
function ServiceTypePicker({ value, onChange, serviceTypes, onAddType }) {
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("");
  async function handleAdd() {
    const t = newType.trim();
    if (t) { await onAddType(t); onChange(t); }
    setAdding(false); setNewType("");
  }
  return adding ? (
    <div style={{ display:"flex", gap:8 }}>
      <input autoFocus type="text" style={{ ...IS, flex:1 }} placeholder="New service type..." value={newType}
        onChange={e => setNewType(e.target.value)}
        onKeyDown={e => { if (e.key==="Enter") handleAdd(); if (e.key==="Escape") setAdding(false); }}/>
      <button onClick={handleAdd} style={{ background:ACCENT, border:"none", color:"#0a0f1e", borderRadius:8, padding:"0 14px", cursor:"pointer", fontWeight:700, flexShrink:0 }}>Add</button>
      <button onClick={() => setAdding(false)} style={{ background:CARD, border:`1px solid #334155`, color:SUBTLE, borderRadius:8, padding:"0 10px", cursor:"pointer", flexShrink:0 }}>✕</button>
    </div>
  ) : (
    <div style={{ display:"flex", gap:8 }}>
      <select style={{ ...IS, flex:1 }} value={value||""} onChange={e => onChange(e.target.value)}>
        <option value="">Select type...</option>
        {serviceTypes.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
      </select>
      <button onClick={() => setAdding(true)} style={{ background:"#1e3a5f", border:`1px solid #334155`, color:ACCENT, borderRadius:8, padding:"0 14px", cursor:"pointer", fontWeight:700, fontSize:20, flexShrink:0 }}>+</button>
    </div>
  );
}

// ─── Service Reminder Config ──────────────────────────────────────────────────
function ServiceReminderConfig({ form, setForm }) {
  const active = form.reminder_type || "none";
  const modes = [
    { val:"none",     label:"No reminder", desc:"One-time service" },
    { val:"mileage",  label:"Mileage",    desc:"After X KM" },
    { val:"schedule", label:"Time",       desc:"After X months" },
    { val:"both",     label:"Either",      desc:"Whichever first" },
  ];
  const km = parseInt(form.reminder_km) || 0;
  const months = parseInt(form.reminder_months) || 0;
  const odo = parseInt(form.odometer) || 0;
  const date = form.date;
  const nextOdo = km && odo ? odo + km : null;
  const nextDate = months && date ? calcNextDueDate(date, months) : null;

  return (
    <div style={{ background:"#0f172a", borderRadius:10, padding:14, border:"1px solid #334155", marginBottom:14 }}>
      <div style={{ fontSize:12, color:SUBTLE, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>Next Reminder</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6, marginBottom: active!=="none" ? 14 : 0 }}>
        {modes.map(m => (
          <button key={m.val} onClick={() => setForm(f => ({ ...f, reminder_type:m.val }))}
            style={{ padding:"9px 6px", borderRadius:8, border:active===m.val ? "none" : "1px solid #334155", cursor:"pointer", textAlign:"center",
              background:active===m.val ? ACCENT : CARD, color:active===m.val ? "#0a0f1e" : MUTED }}>
            <div style={{ fontSize:12, fontWeight:700 }}>{m.label}</div>
            <div style={{ fontSize:10, marginTop:2, opacity:0.75 }}>{m.desc}</div>
          </button>
        ))}
      </div>

      {(active==="mileage" || active==="both") && (
        <div style={{ marginBottom:active==="both" ? 10 : 0 }}>
          <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Next after (KM)</label>
          <input type="number" min="1" style={IS} placeholder="e.g. 10000" value={form.reminder_km||""}
            onChange={e=>setForm(f=>({ ...f, reminder_km:e.target.value }))}/>
          {nextOdo && <div style={{ color:"#22c55e", fontSize:12, marginTop:6 }}>Next at <strong>{nextOdo.toLocaleString()} KM</strong></div>}
          {active!=="both" && odo===0 && <div style={{ color:MUTED, fontSize:11, marginTop:5 }}>Enter the service odometer above to calculate the next KM.</div>}
        </div>
      )}

      {(active==="schedule" || active==="both") && (
        <div>
          <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Next after (months)</label>
          <input type="number" min="1" style={IS} placeholder="e.g. 6" value={form.reminder_months||""}
            onChange={e=>setForm(f=>({ ...f, reminder_months:e.target.value }))}/>
          {nextDate && <div style={{ color:"#22c55e", fontSize:12, marginTop:6 }}>Next on <strong>{nextDate}</strong></div>}
          {!date && <div style={{ color:MUTED, fontSize:11, marginTop:5 }}>Enter the service date above to calculate the next date.</div>}
        </div>
      )}

      {active==="both" && (nextOdo || nextDate) && (
        <div style={{ background:"#38bdf811", border:"1px solid #38bdf833", borderRadius:8, padding:"9px 10px", marginTop:10, fontSize:12, color:SUBTLE }}>
          The reminder will trigger when <strong style={{ color:TEXT }}>either condition</strong> is reached first.
          {nextOdo && <div style={{ marginTop:3 }}>KM: <strong style={{ color:TEXT }}>{nextOdo.toLocaleString()} KM</strong></div>}
          {nextDate && <div style={{ marginTop:3 }}>Date: <strong style={{ color:TEXT }}>{nextDate}</strong></div>}
        </div>
      )}
    </div>
  );
}

// ─── Fuel Form ────────────────────────────────────────────────────────────────
function FuelForm({ form, setForm, defaultPricePerL }) {
  function handleCalc(field, val) {
    const next = { ...form, [field]: val };
    const L = parseFloat(next.liters)      || 0;
    const P = parseFloat(next.price_per_l) || parseFloat(defaultPricePerL) || 0;
    const C = parseFloat(next.cost)        || 0;
    if (field==="liters") {
      if (L && P) next.cost = (L * P).toFixed(2);
    } else if (field==="cost") {
      if (C && P) next.liters = (C / P).toFixed(2);
    } else if (field==="price_per_l") {
      if (L && P) next.cost = (L * P).toFixed(2);
    }
    setForm(next);
  }
  return (
    <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <FF label="Date">
          <input type="date" style={IS} value={form.date||""} onChange={e => setForm(f => ({ ...f, date:e.target.value }))}/>
        </FF>
        <FF label="Odometer (KM)">
          <input type="number" style={IS} placeholder="e.g. 47000" value={form.odometer||""} onChange={e => setForm(f => ({ ...f, odometer:e.target.value }))}/>
        </FF>
      </div>
      <div style={{ background:"#0f172a", borderRadius:10, padding:14, border:"1px solid #334155", marginBottom:14 }}>
        <div style={{ fontSize:12, color:SUBTLE, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>⛽ Fuel Amount</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Litres</label>
            <input type="number" style={IS} placeholder="0.00" value={form.liters||""}
              onChange={e => handleCalc("liters", e.target.value)}/>
          </div>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>RM / Litre</label>
            <input type="number" style={IS} placeholder={defaultPricePerL||"0.00"} value={form.price_per_l ?? defaultPricePerL ?? ""}
              onChange={e => handleCalc("price_per_l", e.target.value)}/>
          </div>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Total (RM)</label>
            <input type="number" style={IS} placeholder="0.00" value={form.cost||""}
              onChange={e => handleCalc("cost", e.target.value)}/>
          </div>
        </div>
        <div style={{ fontSize:11, color:"#475569", marginTop:8 }}>RM / Litre uses your saved default. Enter Litres or Total; you can edit RM / Litre anytime.</div>
      </div>
      <FF label="Tank">
        <select style={IS} value={form.full!==undefined ? (form.full ? "true" : "false") : "true"}
          onChange={e => setForm(f => ({ ...f, full: e.target.value!=="false" }))}>
          <option value="true">Full tank</option>
          <option value="false">Partial</option>
        </select>
      </FF>
    </>
  );
}

// ─── Mini Fuel Chart ──────────────────────────────────────────────────────────
function FuelChart({ data }) {
  if (data.length < 2) return <div style={{ color:MUTED, fontSize:13, padding:"16px 0" }}>Need 2+ fill-ups to show trend</div>;
  const pts = [...data].sort((a,b) => new Date(a.date)-new Date(b.date));
  const effs = [];
  for (let i=1; i<pts.length; i++) {
    const dist = pts[i].odometer - pts[i-1].odometer;
    if (dist>0 && pts[i].full) effs.push({ eff:dist/pts[i].liters });
  }
  if (!effs.length) return <div style={{ color:MUTED, fontSize:13 }}>Not enough full tank data</div>;
  const maxE=Math.max(...effs.map(e=>e.eff)), minE=Math.min(...effs.map(e=>e.eff));
  const W=280, H=80, pad=10;
  const xStep = effs.length>1 ? (W-pad*2)/(effs.length-1) : W-pad*2;
  const yS = v => H-pad-((v-minE)/(maxE-minE+0.001))*(H-pad*2);
  const pathD = effs.map((e,i)=>`${i===0?"M":"L"} ${pad+i*xStep} ${yS(e.eff)}`).join(" ");
  return (
    <div>
      <svg width={W} height={H} style={{ overflow:"visible" }}>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={`${pathD} L ${pad+(effs.length-1)*xStep} ${H} L ${pad} ${H} Z`} fill="url(#lg)"/>
        <path d={pathD} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        {effs.map((e,i) => <circle key={i} cx={pad+i*xStep} cy={yS(e.eff)} r="3" fill={ACCENT}/>)}
      </svg>
      <div style={{ color:SUBTLE, fontSize:11, marginTop:4 }}>
        Avg: {(effs.reduce((s,e)=>s+e.eff,0)/effs.length).toFixed(1)} KM/L
      </div>
    </div>
  );
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onLogin(username.trim(), password);
    } catch (e) {
      setError(e.message || "Login failed");
      setBusy(false);
    }
  }

  return (
    <div style={{
      minHeight:"100vh", background:BG, display:"flex", alignItems:"center",
      justifyContent:"center", padding:20, boxSizing:"border-box"
    }}>
      <form onSubmit={submit} style={{
        width:"100%", maxWidth:380, background:CARD, border:`1px solid ${BORDER}`,
        borderRadius:18, padding:28, boxSizing:"border-box",
        boxShadow:"0 20px 60px rgba(0,0,0,.35)"
      }}>
        <div style={{ textAlign:"center", marginBottom:26 }}>
          <div style={{ fontSize:30, marginBottom:8 }}>🚗</div>
          <div style={{ color:TEXT, fontSize:24, fontWeight:800 }}>AutoCare</div>
          <div style={{ color:MUTED, fontSize:13, marginTop:5 }}>Sign in to continue</div>
        </div>

        <FF label="Username">
          <input
            autoFocus
            autoComplete="username"
            type="text"
            style={IS}
            placeholder="Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
          />
        </FF>

        <FF label="Password">
          <input
            autoComplete="current-password"
            type="password"
            style={IS}
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </FF>

        {error && (
          <div style={{
            color:"#fca5a5", background:"#ef444411", border:"1px solid #ef444433",
            borderRadius:9, padding:"10px 12px", marginBottom:14, fontSize:13
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width:"100%", padding:"12px 18px", borderRadius:10, border:"none",
            cursor:busy?"not-allowed":"pointer", fontWeight:800, fontSize:14,
            background:ACCENT, color:"#0a0f1e", opacity:busy?.65:1
          }}
        >
          {busy ? "Signing in..." : "Login"}
        </button>
      </form>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authLoading,     setAuthLoading]     = useState(true);
  const [user,            setUser]            = useState(null);
  const [tab,             setTab]             = useState("dashboard");
  const [vehicles,        setVehicles]        = useState([]);
  const [services,        setServices]        = useState([]);
  const [fuels,           setFuels]           = useState([]);
  const [reminders,       setReminders]       = useState([]);
  const [serviceTypes,    setServiceTypes]    = useState([]);
  const [settings,        setSettings]        = useState({ fuel_price_per_l:"2.24" });
  const [loading,         setLoading]         = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [modal,           setModal]           = useState(null);
  const [editTarget,      setEditTarget]      = useState(null);
  const [filterType,      setFilterType]      = useState("All");
  const [filterVehicle,   setFilterVehicle]   = useState("All");
  const [form,            setForm]            = useState({});
  const [saving,          setSaving]          = useState(false);
  const [confirmVehicle,   setConfirmVehicle]   = useState(null);
  const [confirmService,   setConfirmService]   = useState(null);

  // ── Authentication + load all data ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [v, s, f, r, st, cfg] = await Promise.all([
        api.getVehicles(), api.getServices(), api.getFuels(),
        api.getReminders(), api.getServiceTypes(), api.getSettings(),
      ]);
      setVehicles(v); setServices(s); setFuels(f);
      setReminders(r); setServiceTypes(st); setSettings(cfg);
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    api.me()
      .then(me => {
        if (!active) return;
        setUser(me);
        loadAll();
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setLoading(false);
        }
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => { active = false; };
  }, [loadAll]);

  async function handleLogin(username, password) {
    const me = await api.login(username, password);
    setUser(me);
    await loadAll();
  }

  async function handleLogout() {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setVehicles([]);
      setServices([]);
      setFuels([]);
      setReminders([]);
      setServiceTypes([]);
      setTab("dashboard");
    }
  }

  if (authLoading) return (
    <div style={{
      minHeight:"100vh", background:BG, display:"flex", alignItems:"center",
      justifyContent:"center"
    }}>
      <Spinner />
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  const veh          = selectedVehicle ? vehicles.find(v=>v.id===selectedVehicle) : null;
  const fuelPrice    = settings.fuel_price_per_l || "2.24";

  const upcomingReminders = useMemo(() =>
    reminders
      .map(r => ({ ...r, vehicle:vehicles.find(v=>v.id===r.vehicle_id) }))
      .filter(r => !getReminderStatus(r).overdue)
      .sort((a,b)=>reminderUrgency(a)-reminderUrgency(b))
      .slice(0,6),
    [reminders, vehicles]);

  const filteredServices = useMemo(() =>
    services
      .filter(s => filterVehicle==="All" || s.vehicle_id===parseInt(filterVehicle))
      .filter(s => filterType==="All"    || s.type===filterType),
    [services, filterType, filterVehicle]);

  function openModal(type, extra={}) {
    const nextForm = { reminder_type:"none", ...extra };
    if (type === "fuel" && !extra.price_per_l) nextForm.price_per_l = fuelPrice;
    setForm(nextForm);
    setModal(type);
  }
  function closeModal() { setModal(null); setForm({}); setEditTarget(null); setSaving(false); }

  async function withSave(fn) {
    setSaving(true);
    try { await fn(); await loadAll(); closeModal(); }
    catch(e) { alert(e.message); setSaving(false); }
  }

  // ── CRUD handlers ──
  const saveService = () => withSave(async () => {
    if (!form.type||!form.date||!form.vehicle_id) throw new Error("Vehicle, type and date are required");
    const reminderType = form.reminder_type || "none";
    const reminderKm = (reminderType === "mileage" || reminderType === "both") ? parseInt(form.reminder_km)||null : null;
    const reminderMonths = (reminderType === "schedule" || reminderType === "both") ? parseInt(form.reminder_months)||null : null;
    if (reminderType === "mileage" && !reminderKm) throw new Error("Enter the next KM interval or choose No reminder");
    if (reminderType === "schedule" && !reminderMonths) throw new Error("Enter the next month interval or choose No reminder");
    if (reminderType === "both" && !reminderKm && !reminderMonths) throw new Error("Enter a KM or month interval, or choose No reminder");
    await api.createService({ vehicle_id:parseInt(form.vehicle_id), type:form.type, date:form.date, odometer:parseInt(form.odometer)||0, cost:parseFloat(form.cost)||0, workshop:form.workshop||"", notes:form.notes||"", reminder_type:reminderType, reminder_km:reminderKm, reminder_months:reminderMonths });
  });

  const saveServiceEdit = () => withSave(async () => {
    if (!form.type||!form.date) throw new Error("Type and date are required");
    const reminderType = form.reminder_type || "none";
    const reminderKm = (reminderType === "mileage" || reminderType === "both") ? parseInt(form.reminder_km)||null : null;
    const reminderMonths = (reminderType === "schedule" || reminderType === "both") ? parseInt(form.reminder_months)||null : null;
    if (reminderType === "mileage" && !reminderKm) throw new Error("Enter the next KM interval or choose No reminder");
    if (reminderType === "schedule" && !reminderMonths) throw new Error("Enter the next month interval or choose No reminder");
    if (reminderType === "both" && !reminderKm && !reminderMonths) throw new Error("Enter a KM or month interval, or choose No reminder");
    await api.updateService(editTarget, { type:form.type, date:form.date, odometer:parseInt(form.odometer)||0, cost:parseFloat(form.cost)||0, workshop:form.workshop||"", notes:form.notes||"", reminder_type:reminderType, reminder_km:reminderKm, reminder_months:reminderMonths });
  });

  function openServiceEdit(s) {
    setEditTarget(s.id);
    setForm({ vehicle_id:String(s.vehicle_id), type:s.type, date:s.date, odometer:String(s.odometer||""), cost:String(s.cost||""), workshop:s.workshop||"", notes:s.notes||"", reminder_type:s.reminder_type||"none", reminder_km:s.reminder_km?String(s.reminder_km):"", reminder_months:s.reminder_months?String(s.reminder_months):"" });
    setModal("service-edit");
  }

  async function removeService(s) {
    if (!s) return;
    try {
      setSaving(true);
      await api.deleteService(s.id);
      await loadAll();
      setConfirmService(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const saveFuel = () => withSave(async () => {
    if (!form.date||!form.vehicle_id) throw new Error("Vehicle and date are required");
    await api.createFuel({ vehicle_id:parseInt(form.vehicle_id), date:form.date, odometer:parseInt(form.odometer)||0, liters:parseFloat(form.liters)||0, price_per_l:parseFloat(form.price_per_l)||parseFloat(fuelPrice)||0, cost:parseFloat(form.cost)||0, full:form.full!==false&&form.full!=="false" });
  });

  const saveFuelEdit = () => withSave(async () => {
    await api.updateFuel(editTarget, { date:form.date, odometer:parseInt(form.odometer)||0, liters:parseFloat(form.liters)||0, price_per_l:parseFloat(form.price_per_l)||0, cost:parseFloat(form.cost)||0, full:form.full!==false&&form.full!=="false" });
  });

  function openFuelEdit(f) {
    setEditTarget(f.id);
    setForm({ date:f.date, odometer:String(f.odometer), liters:String(f.liters), price_per_l:String(f.price_per_l), cost:String(f.cost), full:!!f.full, vehicle_id:String(f.vehicle_id) });
    setModal("fuel-edit");
  }

  const saveVehicle = () => withSave(async () => {
    if (!form.name||!form.plate) throw new Error("Name and plate are required");
    const data = { name:form.name.trim(), plate:form.plate.trim(), year:parseInt(form.year)||2020, color:form.color||"#6366f1" };
    if (editTarget) await api.updateVehicle(editTarget, data);
    else await api.createVehicle(data);
  });

  function openVehicleEdit(v) {
    setEditTarget(v.id);
    setForm({ name:v.name, plate:v.plate, year:String(v.year), color:v.color||"#6366f1" });
    setModal("vehicle-edit");
  }

  async function removeVehicle(v) {
    if (!v) return;
    try {
      setSaving(true);
      await api.deleteVehicle(v.id);
      await loadAll();
      if (selectedVehicle === v.id) {
        setSelectedVehicle(null);
        setTab("vehicles");
      }
      setConfirmVehicle(null);
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  const addServiceType = async (name) => {
    await api.createServiceType(name);
    const updated = await api.getServiceTypes();
    setServiceTypes(updated);
  };

  const deleteServiceType = async (id) => {
    await api.deleteServiceType(id);
    setServiceTypes(p => p.filter(t=>t.id!==id));
  };

  const saveSettings = async () => {
    setSaving(true);
    await api.updateSettings(settings);
    setSaving(false);
  };

  // ── Computed ──
  const totalSpentYear = [...services, ...fuels]
    .filter(x => x.date?.startsWith(new Date().getFullYear().toString()))
    .reduce((s,x)=>s+x.cost,0);
  const overdueCount = reminders.filter(r=>getReminderStatus(r).overdue).length;
  const soonCount    = reminders.filter(r=>{ const st=getReminderStatus(r); return !st.overdue && ((r.due_date!=="9999-12-31" && st.days>=0&&st.days<=30) || (st.kmLeft!==null && st.kmLeft>=0 && st.kmLeft<=5000)); }).length;
  // Fleet fuel economy in KM/L, calculated from full-tank fill-ups.
  const fleetFuelEconomy = useMemo(() => {
    let totalDistance = 0;
    let totalLiters = 0;

    vehicles.forEach(v => {
      const pts = fuels
        .filter(f => f.vehicle_id === v.id && f.full)
        .sort((a,b) => new Date(a.date)-new Date(b.date));

      for (let i=1; i<pts.length; i++) {
        const distance = Number(pts[i].odometer) - Number(pts[i-1].odometer);
        const liters = Number(pts[i].liters);
        if (distance > 0 && liters > 0) {
          totalDistance += distance;
          totalLiters += liters;
        }
      }
    });

    return totalLiters > 0 ? totalDistance / totalLiters : null;
  }, [vehicles, fuels]);

  const overdueReminders = useMemo(() =>
    reminders
      .map(r => ({ ...r, vehicle:vehicles.find(v=>v.id===r.vehicle_id) }))
      .filter(r => getReminderStatus(r).overdue)
      .sort((a,b)=>reminderUrgency(a)-reminderUrgency(b)),
    [reminders, vehicles]);

  const dueSoonReminders = useMemo(() =>
    reminders
      .map(r => ({ ...r, vehicle:vehicles.find(v=>v.id===r.vehicle_id) }))
      .filter(r => {
        const st = getReminderStatus(r);
        return !st.overdue &&
          ((r.due_date!=="9999-12-31" && st.days>=0 && st.days<=30) ||
           (st.kmLeft!==null && st.kmLeft>=0 && st.kmLeft<=5000));
      })
      .sort((a,b)=>reminderUrgency(a)-reminderUrgency(b)),
    [reminders, vehicles]
  );


  // ── Nav ──
  const tabBtn = (id, icon, label) => (
    <button onClick={()=>setTab(id)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 0", flex:1, background:"none", border:"none", cursor:"pointer", color:tab===id?ACCENT:MUTED, borderTop:tab===id?`2px solid ${ACCENT}`:"2px solid transparent", transition:"all 0.2s" }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <span style={{ fontSize:11, fontWeight:600 }}>{label}</span>
    </button>
  );

  // ── Reminder status ──
  function getReminderStatus(r) {
    const vehicle = r.vehicle || vehicles.find(v=>v.id===r.vehicle_id);
    const currentOdo = Number(r.current_odometer) || Number(vehicle?.last_odometer) || 0;
    const dueOdo = Number(r.due_odometer) || null;
    const odoReached = dueOdo !== null && currentOdo >= dueOdo;
    const days = getDaysUntil(r.due_date);
    const dateReached = r.due_date && r.due_date !== "9999-12-31" && days <= 0;
    const overdue = odoReached || dateReached;
    const kmLeft = dueOdo !== null && currentOdo > 0 ? dueOdo - currentOdo : null;
    return { vehicle, currentOdo, days, dueOdo, kmLeft, odoReached, dateReached, overdue };
  }

  function reminderBadge(r) {
    const st = getReminderStatus(r);
    if (st.overdue) {
      if (st.odoReached && st.dateReached) return "Overdue";
      if (st.odoReached) return `${Math.abs(st.kmLeft).toLocaleString()} KM overdue`;
      return `${Math.abs(st.days)}d overdue`;
    }
    if (r.due_odometer && st.kmLeft !== null && st.kmLeft >= 0 && (!r.due_date || r.due_date === "9999-12-31")) return `${st.kmLeft.toLocaleString()} KM left`;
    if (r.due_odometer && st.kmLeft !== null && st.kmLeft >= 0 && r.due_date !== "9999-12-31") return `${st.kmLeft.toLocaleString()} KM / ${st.days}d`;
    if (r.due_date === "9999-12-31") return "Mileage due";
    return urgencyLabel(st.days);
  }

  function reminderUrgency(r) {
    const st = getReminderStatus(r);
    if (st.overdue) return -1;
    if (st.days <= 30 && r.due_date !== "9999-12-31") return st.days;
    if (st.kmLeft !== null && st.kmLeft <= 5000) return Math.max(1, st.days);
    return Math.max(31, st.days);
  }

  // ── Reminder Card ──
  const ReminderCard = ({ r }) => {
    const st = getReminderStatus(r);
    const days = st.days;
    if (days > 9998 && st.dueOdo === null) return null;
    const badge = reminderBadge(r);
    const color = st.overdue ? "#ef4444"
      : (st.days <= 14 || (st.kmLeft !== null && st.kmLeft <= 2000)) ? "#f97316"
      : (st.days <= 30 || (st.kmLeft !== null && st.kmLeft <= 5000)) ? "#eab308"
      : "#22c55e";
    return (
      <div style={{ background:CARD, borderRadius:14, padding:"12px 14px", border:`1px solid ${color}44`, marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0, marginTop:6 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", flexWrap:"wrap", gap:6 }}>
              {r.type}
              {st.vehicle?.name && (
                 <span style={{
                   fontSize:12,
                   color:ACCENT,
                   background:ACCENT+"22",
                   borderRadius:5,
                   padding:"3px 8px",
                   lineHeight:1.2,
                   fontWeight:600
                 }}>
                   {st.vehicle.name}
                 </span>
               )}
              {r.reminder_type && r.reminder_type!=="none" && r.reminder_type!=="legacy" && (
                <span style={{ fontSize:10, color:MUTED, background:MUTED+"22", borderRadius:5, padding:"2px 7px" }}>
                  {r.reminder_type==="both" ? "KM or time" : r.reminder_type==="mileage" ? "Mileage" : "Time"}
                </span>
              )}
            </div>
            <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>{r.due_date!=="9999-12-31" ? `Due ${r.due_date}` : ""}</div>
            {r.due_odometer && <div style={{ fontSize:12, color:MUTED }}>{st.currentOdo ? `Current ${st.currentOdo.toLocaleString()} KM · ` : ""}Due at {r.due_odometer.toLocaleString()} KM</div>}
            {r.interval_km && <div style={{ fontSize:11, color:SUBTLE }}>Next interval: {r.interval_km.toLocaleString()} KM</div>}
            {r.interval_months && <div style={{ fontSize:11, color:SUBTLE }}>Next interval: {r.interval_months} month{r.interval_months>1?"s":""}</div>}
            {r.notes && <div style={{ fontSize:12, color:SUBTLE, marginTop:4 }}>{r.notes}</div>}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color, background:color+"22", borderRadius:8, padding:"3px 8px", flexShrink:0 }}>{badge}</div>
        </div>
        <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
          <button onClick={()=>openModal("service", {
              vehicle_id:String(r.vehicle_id),
              type:r.type,
              date:new Date().toISOString().split("T")[0],
              odometer:st.currentOdo ? String(st.currentOdo) : ""
            })}
            style={{ background:"#22c55e22", border:"none", color:"#22c55e", borderRadius:8, padding:"6px 12px", cursor:"pointer", fontWeight:700, fontSize:12 }}>
            + Record Service
          </button>
        </div>
      </div>
    );
  };

  // ── Compact dashboard reminder card ──
  const DashboardReminderCard = ({ r }) => {
    const st = getReminderStatus(r);
    const badge = reminderBadge(r);
    const color = st.overdue ? "#ef4444" : "#f97316";

    return (
      <div style={{
        background:CARD,
        borderRadius:10,
        padding:"10px 12px",
        border:`1px solid ${BORDER}`,
        marginBottom:7,
        display:"flex",
        alignItems:"center",
        gap:10
      }}>
        <div style={{
          width:7,
          height:7,
          borderRadius:"50%",
          background:color,
          flexShrink:0
        }}/>
        <div style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:7, flexWrap:"wrap" }}>
          <div style={{ fontSize:14, fontWeight:800 }}>
            {r.type}
          </div>
           <div style={{
             fontSize:12,
             color:ACCENT,
             background:ACCENT+"22",
             borderRadius:5,
             padding:"3px 8px",
             lineHeight:1.2,
             fontWeight:600
           }}>
             {st.vehicle?.name || "Unknown vehicle"}
          </div>
        </div>
        <div style={{
          fontSize:11,
          fontWeight:700,
          color:color,
          whiteSpace:"nowrap",
          flexShrink:0
        }}>
          {badge}
        </div>
      </div>
    );
  };

  // ── Fuel Card ──
  const FuelCard = ({ f }) => (
    <div style={{ background:CARD, borderRadius:12, padding:"12px 14px", border:`1px solid ${BORDER}`, marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600 }}>{f.liters}L · RM {parseFloat(f.cost).toFixed(2)} <span style={{ color:MUTED, fontSize:12, fontWeight:400 }}>({parseFloat(f.price_per_l).toFixed(2)}/L)</span></div>
        <div style={{ fontSize:12, color:MUTED }}>{f.date} · {f.odometer.toLocaleString()} KM</div>
      </div>
      <div style={{ fontSize:11, color:f.full?"#22c55e":MUTED }}>{f.full?"⛽ Full":"Partial"}</div>
      <button onClick={()=>openFuelEdit(f)} style={{ background:"#1e3a5f", border:"none", color:ACCENT, borderRadius:8, padding:"5px 10px", cursor:"pointer", fontSize:12, fontWeight:600, flexShrink:0 }}>Edit</button>
    </div>
  );

  if (loading) return (
    <div style={{ background:BG, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ color:ACCENT, fontSize:16, fontWeight:700 }}>🚘 Loading AutoCare...</div>
    </div>
  );

  // Keep all hooks above unconditional. Rendering auth states here avoids
  // changing hook order when the user logs in/out.
  if (authLoading) return (
    <div style={{
      minHeight:"100vh", background:BG, display:"flex", alignItems:"center",
      justifyContent:"center"
    }}>
      <Spinner />
    </div>
  );
  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div style={{ background:BG, minHeight:"100vh", fontFamily:"'DM Sans',system-ui,sans-serif", color:TEXT, display:"flex", flexDirection:"column", maxWidth:480, margin:"0 auto" }}>

      {/* Header */}
      <div style={{ background:SURF, borderBottom:`1px solid ${BORDER}`, padding:"16px 20px", display:"flex", justifyContent:"space-between", alignItems:"center", position:"sticky", top:0, zIndex:100 }}>
        <div>
          <div style={{ fontSize:11, color:MUTED, fontWeight:600, letterSpacing:"0.1em", textTransform:"uppercase" }}>AutoCare</div>
          <div style={{ fontSize:20, fontWeight:800, lineHeight:1.2 }}>My Fleet</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          {tab==="history"   && <Btn label="+ Service"  onClick={()=>openModal("service")}/>}
          {tab==="fuel"      && <Btn label="+ Fill Up"  onClick={()=>openModal("fuel")}/>}
          {tab==="vehicles"  && <Btn label="+ Vehicle"  onClick={()=>openModal("vehicle")}/>}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && (
          <div>
            {/* Main dashboard cards: Vehicles | Fuel Economy / Overdue | Due Soon */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:10 }}>
              {[
                { label:"Vehicles", value:vehicles.length, icon:"🚗", color:ACCENT },
                { label:"Fuel Economy", value:fleetFuelEconomy ? `${fleetFuelEconomy.toFixed(1)} KM/L` : "—", icon:"⛽", color:"#22c55e" },
                { label:"Overdue", value:overdueCount, icon:"🔴", color:"#ef4444" },
                { label:"Due Soon", value:soonCount, icon:"⚠️", color:"#f97316" },
              ].map(c => (
                <div key={c.label} style={{
                  background:CARD,
                  borderRadius:14,
                  padding:16,
                  border:`1px solid ${BORDER}`
                }}>
                  <div style={{ fontSize:22 }}>{c.icon}</div>
                  <div style={{ fontSize:24, fontWeight:800, color:c.color, marginTop:6 }}>{c.value}</div>
                  <div style={{ fontSize:12, color:MUTED, fontWeight:600 }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Small, unobtrusive fleet summary */}
            <div style={{
              fontSize:10,
              color:"#64748b",
              textAlign:"center",
              margin:"2px 0 20px",
              letterSpacing:"0.01em"
            }}>
              FLEET SUMMARY&nbsp;&nbsp;
              RM {totalSpentYear.toFixed(0)} spent · {services.length} services · {fuels.length} fuel-ups
            </div>

            {/* Your Vehicles */}
            <SecTitle t="Your Vehicles"/>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:22 }}>
              {vehicles.map(v => {
                const lastOdo = v.last_odometer;
                const vs = services.filter(s=>s.vehicle_id===v.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
                const vehicleOverdue = reminders.filter(r=>r.vehicle_id===v.id&&getReminderStatus(r).overdue).length;
                const vehicleSoon = reminders.filter(r=>{
                  if (r.vehicle_id!==v.id) return false;
                  const st=getReminderStatus(r);
                  return !st.overdue &&
                    ((r.due_date!=="9999-12-31" && st.days>=0 && st.days<=30) ||
                     (st.kmLeft!==null && st.kmLeft>=0 && st.kmLeft<=5000));
                }).length;

                return (
                  <div key={v.id} onClick={()=>{ setSelectedVehicle(v.id); setTab("vehicle-detail"); }}
                    style={{ background:CARD, borderRadius:14, padding:"14px 16px", border:`1px solid ${BORDER}`, cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:48, height:48, borderRadius:12, background:v.color+"22", border:`2px solid ${v.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🚘</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{v.name}</div>
                      <div style={{ fontSize:12, color:MUTED }}>{v.plate} · {v.year}{lastOdo?` · ${lastOdo.toLocaleString()} KM`:""}</div>
                      {vs[0] && <div style={{ fontSize:11, color:SUBTLE, marginTop:2 }}>Last: {vs[0].type} · {vs[0].date}</div>}
                    </div>

                    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:4 }}>
                      {vehicleOverdue>0 && <div style={{ background:"#ef444422", color:"#ef4444", borderRadius:8, padding:"3px 8px", fontSize:11, fontWeight:700 }}>{vehicleOverdue} overdue</div>}
                      {vehicleSoon>0 && <div style={{ background:"#f9731622", color:"#f97316", borderRadius:8, padding:"3px 8px", fontSize:11, fontWeight:700 }}>{vehicleSoon} due soon</div>}
                    </div>

                    <span style={{ color:MUTED }}>›</span>
                  </div>
                );
              })}
            </div>

            {/* Overdue */}
           <SecTitle t="Overdue"/>
           {overdueReminders.length === 0 ? (
             <div style={{ background:CARD, borderRadius:12, padding:"14px 16px", border:`1px solid ${BORDER}`, color:"#22c55e", fontSize:13, marginBottom:22 }}>
               ✓ No overdue maintenance
             </div>
           ) : (
             <div style={{ marginBottom:22 }}>
               {overdueReminders.map(r=><DashboardReminderCard key={r.id} r={r}/>)}
             </div>
           )}

           {/* Due Soon */}
           <SecTitle t="Due Soon"/>
           {dueSoonReminders.length === 0 ? (
             <div style={{ background:CARD, borderRadius:12, padding:"13px 14px", border:`1px solid ${BORDER}`, color:MUTED, fontSize:13 }}>
               No upcoming maintenance within the next 30 days or 5,000 KM.
             </div>
           ) : (
             <div>
               {dueSoonReminders.map(r=><DashboardReminderCard key={r.id} r={r}/>)}
             </div>
           )}
          </div>
        )}

        {/* ── VEHICLE DETAIL ── */}
        {tab==="vehicle-detail" && veh && (() => {
          const vServices = services.filter(s=>s.vehicle_id===veh.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
          const vFuels    = fuels.filter(f=>f.vehicle_id===veh.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
          return (
            <div>
              <button onClick={()=>setTab("dashboard")} style={{ background:"none", border:"none", color:ACCENT, cursor:"pointer", fontSize:14, marginBottom:16, padding:0, fontWeight:600 }}>← Back</button>
              <div style={{ background:CARD, borderRadius:16, padding:20, border:`1px solid ${BORDER}`, marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:veh.color+"22", border:`2px solid ${veh.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28 }}>🚘</div>
                  <div>
                    <div style={{ fontSize:20, fontWeight:800 }}>{veh.name}</div>
                    <div style={{ fontSize:13, color:MUTED }}>{veh.plate} · {veh.year}{veh.last_odometer?` · ${veh.last_odometer.toLocaleString()} KM`:""}</div>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <div style={{ background:BG, borderRadius:10, padding:12 }}><div style={{ fontSize:11, color:MUTED, marginBottom:4 }}>SERVICES</div><div style={{ fontSize:22, fontWeight:800 }}>{vServices.length}</div></div>
                  <div style={{ background:BG, borderRadius:10, padding:12 }}><div style={{ fontSize:11, color:MUTED, marginBottom:4 }}>FILL-UPS</div><div style={{ fontSize:22, fontWeight:800 }}>{vFuels.length}</div></div>
                </div>
              </div>
              <div style={{ background:CARD, borderRadius:14, padding:16, border:`1px solid ${BORDER}`, marginBottom:16 }}>
                <SecTitle t="Fuel Efficiency Trend"/>
                <FuelChart data={vFuels}/>
              </div>

              {/* Alerts for this vehicle */}
               {(() => {
                 const vAlerts = reminders
                   .filter(r => r.vehicle_id === veh.id)
                   .map(r => ({ ...r, _status:getReminderStatus(r) }))
                   .filter(r => {
                     const st = r._status;
                     return st.overdue ||
                       (!st.overdue && (
                         (r.due_date !== "9999-12-31" && st.days >= 0 && st.days <= 30) ||
                         (st.kmLeft !== null && st.kmLeft >= 0 && st.kmLeft <= 5000)
                       ));
                   })
                   .sort((a,b) => reminderUrgency(a) - reminderUrgency(b));
                 return (
                   <div style={{ marginBottom:16 }}>
                     <SecTitle t="Alerts"/>
                     {vAlerts.length === 0 ? (
                       <div style={{
                         background:CARD,
                         borderRadius:12,
                         padding:"12px 14px",
                         border:`1px solid ${BORDER}`,
                         color:"#22c55e",
                         fontSize:13
                       }}>
                         ✓ No alerts
                       </div>
                     ) : (
                       <div>
                         {vAlerts.map(r => {
                           const st = r._status;
                           const color = st.overdue ? "#ef4444" : "#f97316";
                           return (
                             <div key={r.id} style={{
                               background:CARD,
                               borderRadius:10,
                               padding:"10px 12px",
                               border:`1px solid ${BORDER}`,
                               marginBottom:7,
                               display:"flex",
                               alignItems:"center",
                               gap:10
                             }}>
                               <div style={{
                                 width:7,
                                 height:7,
                                 borderRadius:"50%",
                                 background:color,
                                 flexShrink:0
                               }}/>
                               <div style={{ flex:1, minWidth:0 }}>
                                 <div style={{ fontSize:13, fontWeight:700 }}>
                                   {r.type}
                                 </div>
                               </div>
                               <div style={{
                                 fontSize:11,
                                 fontWeight:700,
                                 color,
                                 whiteSpace:"nowrap"
                               }}>
                                 {reminderBadge(r)}
                               </div>
                             </div>
                           );
                         })}
                       </div>
                     )}
                   </div>
                 );
               })()}

              <div style={{ marginBottom:16 }}>
                <SecTitle t="Service History"/>
                {vServices.map(s => (
                  <div key={s.id} style={{ background:CARD, borderRadius:12, padding:"12px 14px", border:`1px solid ${BORDER}`, marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", gap:10, marginBottom:4 }}>
                      <span style={{ fontWeight:700 }}>{s.type}</span>
                      <span style={{ color:ACCENT, fontWeight:700 }}>{s.odometer.toLocaleString()} KM</span>
                    </div>
                    <div style={{ fontSize:12, color:MUTED }}>{s.date} · RM {s.cost}{s.workshop?` · ${s.workshop}`:""}</div>
                    {s.reminder_type && s.reminder_type!=="none" && <div style={{ fontSize:11, color:"#22c55e", marginTop:5 }}>Next reminder: {s.reminder_type==="mileage"?`${(s.reminder_km||0).toLocaleString()} KM`:s.reminder_type==="schedule"?`${s.reminder_months||0} month${s.reminder_months>1?"s":""}`:`${s.reminder_km?(s.reminder_km.toLocaleString()+" KM"):""}${s.reminder_km&&s.reminder_months?" or ":""}${s.reminder_months?(s.reminder_months+" month"+(s.reminder_months>1?"s":"")):""}`}</div>}
                    {s.notes && <div style={{ fontSize:12, color:SUBTLE, marginTop:4 }}>{s.notes}</div>}
                    <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:8 }}>
                      <button onClick={()=>openServiceEdit(s)} style={{ background:"#1e3a5f", border:"none", color:ACCENT, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>Edit</button>
                      <button onClick={()=>setConfirmService(s)} style={{ background:"#ef444422", border:"none", color:"#ef4444", borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
              <div>
                <SecTitle t="Fuel Log"/>
                {vFuels.map(f=><FuelCard key={f.id} f={f}/>)}
              </div>
            </div>
          );
        })()}

        {/* ── SERVICE HISTORY ── */}
        {tab==="history" && (
          <div>
            <div style={{ display:"flex", gap:8, marginBottom:14 }}>
              <select value={filterVehicle} onChange={e=>setFilterVehicle(e.target.value)} style={{ ...IS, flex:1 }}>
                <option value="All">All Vehicles</option>
                {vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <select value={filterType} onChange={e=>setFilterType(e.target.value)} style={{ ...IS, flex:1 }}>
                <option value="All">All Types</option>
                {serviceTypes.map(t=><option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div style={{ fontSize:12, color:MUTED, marginBottom:10 }}>{filteredServices.length} records</div>
            {filteredServices.map(s => {
              const v = vehicles.find(vv=>vv.id===s.vehicle_id);
              return (
                <div key={s.id} style={{ background:CARD, borderRadius:14, padding:"14px 16px", border:`1px solid ${BORDER}`, marginBottom:10 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
                    <div>
                      <span style={{ fontWeight:700 }}>{s.type}</span>
                      <span style={{ marginLeft:8, fontSize:12, color:ACCENT, background:ACCENT+"22", borderRadius:7, padding:"3px 8px",fontWeight:600 }}>{v?.name}</span>
                    </div>
                    <span style={{ color:ACCENT, fontWeight:700 }}>{s.odometer.toLocaleString()} KM</span>
                  </div>
                  <div style={{ fontSize:12, color:MUTED }}>{s.date} · RM {s.cost}{s.workshop?` · ${s.workshop}`:""}</div>
                  {s.reminder_type && s.reminder_type!=="none" && <div style={{ fontSize:11, color:"#22c55e", marginTop:6 }}>Next reminder: {s.reminder_type==="mileage"?`${(s.reminder_km||0).toLocaleString()} KM`:s.reminder_type==="schedule"?`${s.reminder_months||0} month${s.reminder_months>1?"s":""}`:`${s.reminder_km?(s.reminder_km.toLocaleString()+" KM"):""}${s.reminder_km&&s.reminder_months?" or ":""}${s.reminder_months?(s.reminder_months+" month"+(s.reminder_months>1?"s":"")):""}`}</div>}
                  {s.notes && <div style={{ fontSize:12, color:SUBTLE, marginTop:6, borderTop:`1px solid ${BORDER}`, paddingTop:6 }}>{s.notes}</div>}
                  <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:8 }}>
                    <button onClick={()=>openServiceEdit(s)} style={{ background:"#1e3a5f", border:"none", color:ACCENT, borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>Edit</button>
                    <button onClick={()=>setConfirmService(s)} style={{ background:"#ef444422", border:"none", color:"#ef4444", borderRadius:7, padding:"5px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── FUEL ── */}
        {tab==="fuel" && (
          <div>
            <div style={{ marginBottom:14 }}>
              <select value={filterVehicle} onChange={e=>setFilterVehicle(e.target.value)} style={IS}>
                <option value="All">All Vehicles</option>
                {vehicles.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            {vehicles.filter(v=>filterVehicle==="All"||v.id===parseInt(filterVehicle)).map(v => {
              const vf = fuels.filter(f=>f.vehicle_id===v.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
              if (!vf.length) return null;
              return (
                <div key={v.id} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, color:v.color, fontWeight:700, marginBottom:10 }}>🚘 {v.name}</div>
                  <div style={{ background:CARD, borderRadius:14, padding:14, border:`1px solid ${BORDER}`, marginBottom:10 }}><FuelChart data={vf}/></div>
                  {vf.map(f=><FuelCard key={f.id} f={f}/>)}
                </div>
              );
            })}
          </div>
        )}

        {/* ── REMINDERS ── */}
        {tab==="reminders" && (
          <div>
            {["Overdue","This Month","Upcoming"].map(group => {
              const grouped = reminders
                .map(r=>({ ...r, vehicle:vehicles.find(v=>v.id===r.vehicle_id) }))
                .filter(r => {
                  const st = getReminderStatus(r);
                  if (group === "Overdue") return st.overdue;
                  if (group === "This Month") return !st.overdue && r.due_date!=="9999-12-31" && st.days>=0 && st.days<=30;
                  return !st.overdue && (r.due_date==="9999-12-31" || st.days>30);
                })
                .sort((a,b)=>reminderUrgency(a)-reminderUrgency(b));
              if (!grouped.length) return null;
              return (
                <div key={group} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, color:group==="Overdue"?"#ef4444":group==="This Month"?"#f97316":MUTED, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{group}</div>
                  {grouped.map(r=><ReminderCard key={r.id} r={r}/>)}
                </div>
              );
            })}
          </div>
        )}

        {/* ── VEHICLES ── */}
        {tab==="vehicles" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {vehicles.map(v => {
              const vs    = services.filter(s=>s.vehicle_id===v.id);
              const total = vs.reduce((s,x)=>s+x.cost,0) + fuels.filter(f=>f.vehicle_id===v.id).reduce((s,x)=>s+x.cost,0);
              return (
                <div key={v.id} style={{ background:CARD, borderRadius:16, padding:18, border:`1px solid ${BORDER}` }}>
                  <div style={{ display:"flex", gap:14, alignItems:"center", marginBottom:12 }}>
                    <div style={{ width:52, height:52, borderRadius:14, background:v.color+"22", border:`2px solid ${v.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:26 }}>🚘</div>
                    <div style={{ flex:1, minWidth:0 }}><div style={{ fontWeight:800, fontSize:16 }}>{v.name}</div><div style={{ fontSize:12, color:MUTED }}>{v.plate} · {v.year}</div></div>
                    <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                      <button onClick={()=>openVehicleEdit(v)} style={{ background:"#1e3a5f", border:"none", color:ACCENT, borderRadius:8, padding:"6px 10px", cursor:"pointer", fontSize:12, fontWeight:700 }}>Edit</button>
                      <button onClick={()=>removeVehicle(v)} disabled={saving} style={{ background:"#ef444422", border:"none", color:"#ef4444", borderRadius:8, padding:"6px 10px", cursor:saving?"not-allowed":"pointer", fontSize:12, fontWeight:700, opacity:saving?0.5:1 }}>Remove</button>
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                    {[["Services",vs.length],["Fill-ups",fuels.filter(f=>f.vehicle_id===v.id).length],["Total Spent",`RM${total.toFixed(0)}`]].map(([l,val])=>(
                      <div key={l} style={{ background:BG, borderRadius:10, padding:"10px 8px", textAlign:"center" }}>
                        <div style={{ fontSize:16, fontWeight:800, color:ACCENT }}>{val}</div>
                        <div style={{ fontSize:11, color:MUTED }}>{l}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="settings" && (
          <div>
            <div style={{ background:CARD, borderRadius:14, padding:18, border:`1px solid ${BORDER}`, marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>⛽ Fuel Price</div>
              <div style={{ fontSize:13, color:MUTED, marginBottom:14 }}>Default price per litre, pre-filled when adding a fill-up.</div>
              <FF label="Price per Litre (RM)">
                <input type="number" style={IS} step="0.01" placeholder="2.24"
                  value={settings.fuel_price_per_l||""}
                  onChange={e => setSettings(s=>({ ...s, fuel_price_per_l:e.target.value }))}/>
              </FF>
              <Btn label={saving ? "Saving..." : "Save"} onClick={saveSettings} disabled={saving}/>
            </div>

            <div style={{ background:CARD, borderRadius:14, padding:18, border:`1px solid ${BORDER}`, marginBottom:16 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:14 }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>🚗 Cars</div>
                  <div style={{ fontSize:13, color:MUTED }}>Add and manage the cars used for service, fuel and reminders.</div>
                </div>
                <Btn label="+ Add Car" onClick={()=>openModal("vehicle")} />
              </div>
              {vehicles.length ? (
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {vehicles.map(v => (
                    <div key={v.id} style={{ display:"flex", alignItems:"center", gap:10, background:BG, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ width:34, height:34, borderRadius:9, background:v.color+"22", border:`1px solid ${v.color}`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>🚘</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:700 }}>{v.name}</div>
                        <div style={{ fontSize:11, color:MUTED }}>{v.plate} · {v.year}</div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <button onClick={() => openVehicleEdit(v)}
                          style={{ background:"#1e3a5f", border:"none", color:ACCENT, borderRadius:7, padding:"6px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
                          Edit
                        </button>
                        <button onClick={() => setConfirmVehicle(v)}
                          style={{ background:"#ef444422", border:"none", color:"#ef4444", borderRadius:7, padding:"6px 10px", cursor:"pointer", fontSize:11, fontWeight:700 }}>
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color:MUTED, fontSize:13, padding:"10px 0 2px" }}>No cars added yet. Tap “+ Add Car” to add your first car.</div>
              )}
            </div>

            <div style={{ background:CARD, borderRadius:14, padding:18, border:`1px solid ${BORDER}` }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>🔧 Service Types</div>
              <div style={{ fontSize:13, color:MUTED, marginBottom:14 }}>Manage available service types across all forms.</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:14 }}>
                {serviceTypes.map(t => (
                  <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, background:BG, borderRadius:10, padding:"10px 14px" }}>
                    <span style={{ flex:1, fontSize:14 }}>{t.name}</span>
                    {t.is_default
                      ? <span style={{ fontSize:11, color:MUTED }}>Default</span>
                      : <button onClick={()=>deleteServiceType(t.id)} style={{ background:"#ef444422", border:"none", color:"#ef4444", borderRadius:6, padding:"3px 10px", cursor:"pointer", fontSize:12, fontWeight:700 }}>Remove</button>
                    }
                  </div>
                ))}
              </div>
              <ServiceTypePicker value="" onChange={()=>{}} serviceTypes={serviceTypes} onAddType={addServiceType}/>
            </div>
            <div style={{ background:CARD, borderRadius:14, padding:18, border:`1px solid ${BORDER}` }}>
              <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>🔒 Account</div>
              <div style={{ fontSize:13, color:MUTED, marginBottom:14 }}>
                Signed in as <strong style={{ color:TEXT }}>{user?.username || ""}</strong>
              </div>
              <Btn label="Logout" onClick={handleLogout} variant="danger"/>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:SURF, borderTop:`1px solid ${BORDER}`, display:"flex", zIndex:200 }}>
        {tabBtn("dashboard", "🏠", "Home")}
        {tabBtn("history",   "🔧", "Services")}
        {tabBtn("fuel",      "⛽", "Fuel")}
        {tabBtn("reminders", "🔔", "Alerts")}
        {tabBtn("settings",  "⚙️", "Settings")}
      </div>

      {/* ── Modals ── */}
      {(modal==="service" || modal==="service-edit") && (
        <Modal title={modal==="service-edit" ? "Edit Service Record" : "Add Service Record"} onClose={closeModal}>
          <FF label="Vehicle">
            <select style={IS} value={form.vehicle_id||""} disabled={modal==="service-edit"} onChange={e=>setForm(f=>({ ...f, vehicle_id:e.target.value }))}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v=><option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
            </select>
          </FF>
          <FF label="Service Type">
            <ServiceTypePicker value={form.type} onChange={val=>setForm(f=>({ ...f, type:val }))} serviceTypes={serviceTypes} onAddType={addServiceType}/>
          </FF>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <FF label="Date"><input type="date" style={IS} value={form.date||""} onChange={e=>setForm(f=>({ ...f, date:e.target.value }))}/></FF>
            <FF label="Odometer (KM)"><input type="number" style={IS} placeholder="e.g. 45000" value={form.odometer||""} onChange={e=>setForm(f=>({ ...f, odometer:e.target.value }))}/></FF>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <FF label="Cost (RM)"><input type="number" style={IS} placeholder="0.00" value={form.cost||""} onChange={e=>setForm(f=>({ ...f, cost:e.target.value }))}/></FF>
            <FF label="Workshop"><input type="text" style={IS} placeholder="Name or DIY" value={form.workshop||""} onChange={e=>setForm(f=>({ ...f, workshop:e.target.value }))}/></FF>
          </div>
          <ServiceReminderConfig form={form} setForm={setForm}/>
          <FF label="Notes"><textarea style={{ ...IS, minHeight:60, resize:"vertical" }} value={form.notes||""} onChange={e=>setForm(f=>({ ...f, notes:e.target.value }))}/></FF>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":modal==="service-edit"?"Save Changes":"Save Record"} onClick={modal==="service-edit"?saveServiceEdit:saveService} disabled={saving}/>
          </div>
        </Modal>
      )}

      {modal==="fuel" && (
        <Modal title="Add Fuel Fill-Up" onClose={closeModal}>
          <FF label="Vehicle">
            <select style={IS} onChange={e=>setForm(f=>({ ...f, vehicle_id:e.target.value }))}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v=><option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
            </select>
          </FF>
          <FuelForm form={form} setForm={setForm} defaultPricePerL={fuelPrice}/>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":"Save Fill-Up"} onClick={saveFuel} disabled={saving}/>
          </div>
        </Modal>
      )}

      {modal==="fuel-edit" && (
        <Modal title="Edit Fill-Up" onClose={closeModal}>
          <FuelForm form={form} setForm={setForm} defaultPricePerL={fuelPrice}/>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":"Save Changes"} onClick={saveFuelEdit} disabled={saving}/>
          </div>
        </Modal>
      )}

      {confirmService && (
        <Modal title="Remove Service?" onClose={() => !saving && setConfirmService(null)}>
          <div style={{ color:TEXT, fontSize:14, lineHeight:1.6, marginBottom:16 }}>
            Are you sure you want to remove <strong>{confirmService.type}</strong> on {confirmService.date}?
            <div style={{ color:"#fca5a5", background:"#ef444411", border:"1px solid #ef444433", borderRadius:10, padding:"10px 12px", marginTop:12 }}>
              The reminder generated by this service will also be removed. If there is an older service of the same type, its reminder will be restored automatically.
            </div>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={() => setConfirmService(null)} variant="secondary" disabled={saving}/>
            <Btn label={saving ? "Removing..." : "Yes, Remove"} onClick={() => removeService(confirmService)} variant="danger" disabled={saving}/>
          </div>
        </Modal>
      )}

      {confirmVehicle && (
        <Modal title="Remove Car?" onClose={() => !saving && setConfirmVehicle(null)}>
          <div style={{ color:TEXT, fontSize:14, lineHeight:1.6, marginBottom:16 }}>
            Are you sure you want to remove <strong>{confirmVehicle.name}</strong> ({confirmVehicle.plate})?
            <div style={{ color:"#fca5a5", background:"#ef444411", border:"1px solid #ef444433", borderRadius:10, padding:"10px 12px", marginTop:12 }}>
              This will permanently delete the car and all of its service, fuel and reminder records. This action cannot be undone.
            </div>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={() => setConfirmVehicle(null)} variant="secondary" disabled={saving}/>
            <Btn label={saving ? "Removing..." : "Yes, Remove"} onClick={() => removeVehicle(confirmVehicle)} variant="danger" disabled={saving}/>
          </div>
        </Modal>
      )}

      {(modal==="vehicle" || modal==="vehicle-edit") && (
        <Modal title={modal==="vehicle-edit" ? "Edit Vehicle" : "Add Vehicle"} onClose={closeModal}>
          <FF label="Vehicle Name"><input type="text" style={IS} placeholder="e.g. Perodua Myvi" value={form.name||""} onChange={e=>setForm(f=>({ ...f, name:e.target.value }))}/></FF>
          <FF label="Plate Number"><input type="text" style={IS} placeholder="e.g. BCD 1234" value={form.plate||""} onChange={e=>setForm(f=>({ ...f, plate:e.target.value }))}/></FF>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <FF label="Year"><input type="number" style={IS} placeholder="2020" value={form.year||""} onChange={e=>setForm(f=>({ ...f, year:e.target.value }))}/></FF>
            <FF label="Color"><input type="color" style={{ ...IS, height:42, padding:4 }} value={form.color||"#6366f1"} onChange={e=>setForm(f=>({ ...f, color:e.target.value }))}/></FF>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":modal==="vehicle-edit" ? "Save Changes" : "Add Vehicle"} onClick={saveVehicle} disabled={saving}/>
          </div>
        </Modal>
      )}
    </div>
  );
}
