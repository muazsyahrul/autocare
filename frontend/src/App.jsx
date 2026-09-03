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
function recurLabel(r) {
  if (!r.recur_type || r.recur_type === "none") return null;
  if (r.recur_type === "mileage")  return `Every ${r.recur_value?.toLocaleString()} km`;
  if (r.recur_type === "schedule") return `Every ${r.recur_value} month${r.recur_value > 1 ? "s" : ""}`;
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
const MUTED  = "#64748b";
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

// ─── Recurring Config ─────────────────────────────────────────────────────────
function RecurringConfig({ form, setForm }) {
  const active = form.recur_type || "none";
  const modes  = [
    { val:"none",     label:"One-time",  desc:null },
    { val:"mileage",  label:"Mileage",   desc:"Every X km" },
    { val:"schedule", label:"Schedule",  desc:"Every X months" },
  ];
  return (
    <div style={{ background:"#0f172a", borderRadius:10, padding:14, border:"1px solid #334155", marginBottom:14 }}>
      <div style={{ fontSize:12, color:SUBTLE, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:10 }}>🔁 Recurrence</div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:6, marginBottom: active!=="none" ? 14 : 0 }}>
        {modes.map(m => (
          <button key={m.val} onClick={() => setForm(f => ({ ...f, recur_type:m.val }))}
            style={{ padding:"8px 6px", borderRadius:8, border: active===m.val ? "none" : "1px solid #334155", cursor:"pointer", textAlign:"center",
              background: active===m.val ? ACCENT : CARD, color: active===m.val ? "#0a0f1e" : MUTED }}>
            <div style={{ fontSize:13, fontWeight:700 }}>{m.label}</div>
            {m.desc && <div style={{ fontSize:10, marginTop:2, opacity:0.75 }}>{m.desc}</div>}
          </button>
        ))}
      </div>
      {active==="mileage" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Every (km)</label>
            <input type="number" style={IS} placeholder="e.g. 5000" value={form.recur_value||""}
              onChange={e => setForm(f => ({ ...f, recur_value:e.target.value }))}/>
          </div>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Last done (odometer)</label>
            <input type="number" style={IS} placeholder="e.g. 45000" value={form.last_done_odo||""}
              onChange={e => setForm(f => ({ ...f, last_done_odo:e.target.value }))}/>
          </div>
        </div>
      )}
      {active==="schedule" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Every (months)</label>
            <input type="number" style={IS} placeholder="e.g. 6" value={form.recur_value||""}
              onChange={e => setForm(f => ({ ...f, recur_value:e.target.value }))}/>
          </div>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Last done (date)</label>
            <input type="date" style={IS} value={form.last_done_date||""}
              onChange={e => setForm(f => ({ ...f, last_done_date:e.target.value }))}/>
          </div>
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
    const P = parseFloat(next.price_per_l) || 0;
    const C = parseFloat(next.cost)        || 0;
    if (field==="liters" || field==="price_per_l") {
      if (L && P) next.cost = (L * P).toFixed(2);
    } else if (field==="cost") {
      if (C && L) next.price_per_l = (C / L).toFixed(4);
      else if (C && P) next.liters = (C / P).toFixed(2);
    }
    setForm(next);
  }
  return (
    <>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14 }}>
        <FF label="Date">
          <input type="date" style={IS} value={form.date||""} onChange={e => setForm(f => ({ ...f, date:e.target.value }))}/>
        </FF>
        <FF label="Odometer (km)">
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
            <input type="number" style={IS} placeholder={defaultPricePerL||"0.00"} value={form.price_per_l||""}
              onChange={e => handleCalc("price_per_l", e.target.value)}/>
          </div>
          <div>
            <label style={{ display:"block", color:MUTED, fontSize:11, marginBottom:5 }}>Total (RM)</label>
            <input type="number" style={IS} placeholder="0.00" value={form.cost||""}
              onChange={e => handleCalc("cost", e.target.value)}/>
          </div>
        </div>
        <div style={{ fontSize:11, color:"#475569", marginTop:8 }}>Fill any two — the third calculates automatically.</div>
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
    if (dist>0 && pts[i].full) effs.push({ eff:(pts[i].liters/dist)*100 });
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
        Avg: {(effs.reduce((s,e)=>s+e.eff,0)/effs.length).toFixed(1)} L/100km
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
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

  // ── Load all data on mount ──
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [v, s, f, r, st, cfg] = await Promise.all([
        api.getVehicles(), api.getServices(), api.getFuels(),
        api.getReminders(), api.getServiceTypes(), api.getSettings(),
      ]);
      setVehicles(v); setServices(s); setFuels(f);
      setReminders(r); setServiceTypes(st); setSettings(cfg);
    } catch(e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const veh          = selectedVehicle ? vehicles.find(v=>v.id===selectedVehicle) : null;
  const fuelPrice    = settings.fuel_price_per_l || "2.24";

  const upcomingReminders = useMemo(() =>
    reminders.map(r => ({ ...r, days:getDaysUntil(r.due_date), vehicle:vehicles.find(v=>v.id===r.vehicle_id) }))
      .filter(r => r.days < 9999)
      .sort((a,b)=>a.days-b.days).slice(0,6),
    [reminders, vehicles]);

  const filteredServices = useMemo(() =>
    services
      .filter(s => filterVehicle==="All" || s.vehicle_id===parseInt(filterVehicle))
      .filter(s => filterType==="All"    || s.type===filterType),
    [services, filterType, filterVehicle]);

  function openModal(type, extra={}) { setForm({ recur_type:"none", ...extra }); setModal(type); }
  function closeModal() { setModal(null); setForm({}); setEditTarget(null); setSaving(false); }

  async function withSave(fn) {
    setSaving(true);
    try { await fn(); await loadAll(); closeModal(); }
    catch(e) { alert(e.message); setSaving(false); }
  }

  // ── CRUD handlers ──
  const saveService = () => withSave(async () => {
    if (!form.type||!form.date||!form.vehicle_id) throw new Error("Vehicle, type and date are required");
    await api.createService({ vehicle_id:parseInt(form.vehicle_id), type:form.type, date:form.date, odometer:parseInt(form.odometer)||0, cost:parseFloat(form.cost)||0, workshop:form.workshop||"", notes:form.notes||"" });
  });

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

  const saveReminder = () => withSave(async () => {
    if (!form.type||!form.vehicle_id) throw new Error("Vehicle and type are required");
    const rt = form.recur_type||"none";
    let due_date = form.due_date||"";
    let due_odometer = form.due_odometer ? parseInt(form.due_odometer) : null;
    if (rt==="schedule" && form.last_done_date && form.recur_value)
      due_date = calcNextDueDate(form.last_done_date, parseInt(form.recur_value)) || due_date;
    if (rt==="mileage" && form.last_done_odo && form.recur_value)
      due_odometer = parseInt(form.last_done_odo) + parseInt(form.recur_value);
    if (!due_date) throw new Error("Due date is required");
    await api.createReminder({ vehicle_id:parseInt(form.vehicle_id), type:form.type, due_date, due_odometer, notes:form.notes||"", recur_type:rt, recur_value:form.recur_value?parseInt(form.recur_value):null, last_done_date:form.last_done_date||null, last_done_odo:form.last_done_odo?parseInt(form.last_done_odo):null });
  });

  const markDone = (r) => withSave(async () => {
    const todayStr = new Date().toISOString().split("T")[0];
    if (!r.recur_type||r.recur_type==="none") {
      await api.updateReminder(r.id, { ...r, due_date:"9999-12-31" });
      return;
    }
    let due_date = r.due_date, due_odometer = r.due_odometer;
    if (r.recur_type==="schedule") due_date = calcNextDueDate(todayStr, r.recur_value)||r.due_date;
    if (r.recur_type==="mileage"&&r.due_odometer) due_odometer = r.due_odometer + r.recur_value;
    await api.updateReminder(r.id, { ...r, due_date, due_odometer, last_done_date:todayStr, last_done_odo:r.due_odometer });
  });

  const saveVehicle = () => withSave(async () => {
    if (!form.name||!form.plate) throw new Error("Name and plate are required");
    await api.createVehicle({ name:form.name, plate:form.plate, year:parseInt(form.year)||2020, color:form.color||"#6366f1" });
  });

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
  const overdueCount = reminders.filter(r=>getDaysUntil(r.due_date)<0).length;
  const soonCount    = reminders.filter(r=>{ const d=getDaysUntil(r.due_date); return d>=0&&d<=30; }).length;

  // ── Nav ──
  const tabBtn = (id, icon, label) => (
    <button onClick={()=>setTab(id)} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"10px 0", flex:1, background:"none", border:"none", cursor:"pointer", color:tab===id?ACCENT:MUTED, borderTop:tab===id?`2px solid ${ACCENT}`:"2px solid transparent", transition:"all 0.2s" }}>
      <span style={{ fontSize:20 }}>{icon}</span>
      <span style={{ fontSize:11, fontWeight:600 }}>{label}</span>
    </button>
  );

  // ── Reminder Card ──
  const ReminderCard = ({ r, showDone=false }) => {
    const days = getDaysUntil(r.due_date);
    if (days > 9998) return null;
    return (
      <div style={{ background:CARD, borderRadius:14, padding:"12px 14px", border:`1px solid ${urgencyColor(days)}44`, marginBottom:8 }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:urgencyColor(days), flexShrink:0, marginTop:6 }}/>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:700, fontSize:14, display:"flex", alignItems:"center", flexWrap:"wrap", gap:6 }}>
              {r.type}
              {recurLabel(r) && <span style={{ fontSize:11, color:ACCENT, background:ACCENT+"22", borderRadius:5, padding:"2px 7px" }}>↻ {recurLabel(r)}</span>}
            </div>
            <div style={{ fontSize:12, color:MUTED, marginTop:2 }}>{r.vehicle?.name} · Due {r.due_date}</div>
            {r.due_odometer && <div style={{ fontSize:12, color:MUTED }}>or at {r.due_odometer.toLocaleString()} km</div>}
            {r.notes && <div style={{ fontSize:12, color:SUBTLE, marginTop:4 }}>{r.notes}</div>}
          </div>
          <div style={{ fontSize:12, fontWeight:700, color:urgencyColor(days), background:urgencyColor(days)+"22", borderRadius:8, padding:"3px 8px", flexShrink:0 }}>{urgencyLabel(days)}</div>
        </div>
        {showDone && (
          <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
            <button onClick={()=>markDone(r)} style={{ background:"#22c55e22", border:"none", color:"#22c55e", borderRadius:8, padding:"6px 14px", cursor:"pointer", fontWeight:700, fontSize:12 }}>
              ✓ Mark Done{r.recur_type&&r.recur_type!=="none" ? " & Reschedule" : ""}
            </button>
          </div>
        )}
      </div>
    );
  };

  // ── Fuel Card ──
  const FuelCard = ({ f }) => (
    <div style={{ background:CARD, borderRadius:12, padding:"12px 14px", border:`1px solid ${BORDER}`, marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:600 }}>{f.liters}L · RM {parseFloat(f.cost).toFixed(2)} <span style={{ color:MUTED, fontSize:12, fontWeight:400 }}>({parseFloat(f.price_per_l).toFixed(2)}/L)</span></div>
        <div style={{ fontSize:12, color:MUTED }}>{f.date} · {f.odometer.toLocaleString()} km</div>
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
          {tab==="reminders" && <Btn label="+ Reminder" onClick={()=>openModal("reminder")}/>}
          {tab==="vehicles"  && <Btn label="+ Car"  onClick={()=>openModal("vehicle")}/>}
        </div>
      </div>

      <div style={{ flex:1, overflowY:"auto", padding:"16px 16px 80px" }}>

        {/* ── DASHBOARD ── */}
        {tab==="dashboard" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
              {[
                { label:"Vehicles",   value:vehicles.length,                   icon:"🚗", color:ACCENT },
                { label:`Spent ${new Date().getFullYear()}`, value:`RM ${totalSpentYear.toFixed(0)}`, icon:"💰", color:"#a78bfa" },
                { label:"Overdue",    value:overdueCount,                      icon:"🔴", color:"#ef4444" },
                { label:"Due Soon",   value:soonCount,                         icon:"⚠️", color:"#f97316" },
              ].map(c => (
                <div key={c.label} style={{ background:CARD, borderRadius:14, padding:16, border:`1px solid ${BORDER}` }}>
                  <div style={{ fontSize:22 }}>{c.icon}</div>
                  <div style={{ fontSize:24, fontWeight:800, color:c.color, marginTop:6 }}>{c.value}</div>
                  <div style={{ fontSize:12, color:MUTED, fontWeight:600 }}>{c.label}</div>
                </div>
              ))}
            </div>

            <SecTitle t="Your Vehicles"/>
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:20 }}>
              {vehicles.map(v => {
                const lastOdo = v.last_odometer;
                const vs      = services.filter(s=>s.vehicle_id===v.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
                const overdue = reminders.filter(r=>r.vehicle_id===v.id&&getDaysUntil(r.due_date)<0).length;
                return (
                  <div key={v.id} onClick={()=>{ setSelectedVehicle(v.id); setTab("vehicle-detail"); }}
                    style={{ background:CARD, borderRadius:14, padding:"14px 16px", border:`1px solid ${BORDER}`, cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                    <div style={{ width:48, height:48, borderRadius:12, background:v.color+"22", border:`2px solid ${v.color}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>🚘</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15, marginBottom:2 }}>{v.name}</div>
                      <div style={{ fontSize:12, color:MUTED }}>{v.plate} · {v.year}{lastOdo?` · ${lastOdo.toLocaleString()} km`:""}</div>
                      {vs[0] && <div style={{ fontSize:11, color:SUBTLE, marginTop:2 }}>Last: {vs[0].type} · {vs[0].date}</div>}
                    </div>
                    {overdue>0 && <div style={{ background:"#ef444422", color:"#ef4444", borderRadius:8, padding:"3px 8px", fontSize:12, fontWeight:700 }}>{overdue} overdue</div>}
                    <span style={{ color:MUTED }}>›</span>
                  </div>
                );
              })}
            </div>

            <SecTitle t="Upcoming Reminders"/>
            {upcomingReminders.map(r=><ReminderCard key={r.id} r={r}/>)}
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
                    <div style={{ fontSize:13, color:MUTED }}>{veh.plate} · {veh.year}{veh.last_odometer?` · ${veh.last_odometer.toLocaleString()} km`:""}</div>
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
              <div style={{ marginBottom:16 }}>
                <SecTitle t="Service History"/>
                {vServices.map(s => (
                  <div key={s.id} style={{ background:CARD, borderRadius:12, padding:"12px 14px", border:`1px solid ${BORDER}`, marginBottom:8 }}>
                    <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                      <span style={{ fontWeight:700 }}>{s.type}</span>
                      <span style={{ color:ACCENT, fontWeight:700 }}>RM {s.cost}</span>
                    </div>
                    <div style={{ fontSize:12, color:MUTED }}>{s.date} · {s.odometer.toLocaleString()} km{s.workshop?` · ${s.workshop}`:""}</div>
                    {s.notes && <div style={{ fontSize:12, color:SUBTLE, marginTop:4 }}>{s.notes}</div>}
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
                      <span style={{ marginLeft:8, fontSize:12, color:MUTED, background:"#334155", borderRadius:6, padding:"2px 8px" }}>{v?.name}</span>
                    </div>
                    <span style={{ color:ACCENT, fontWeight:700 }}>RM {s.cost}</span>
                  </div>
                  <div style={{ fontSize:12, color:MUTED }}>{s.date} · {s.odometer.toLocaleString()} km{s.workshop?` · ${s.workshop}`:""}</div>
                  {s.notes && <div style={{ fontSize:12, color:SUBTLE, marginTop:6, borderTop:`1px solid ${BORDER}`, paddingTop:6 }}>{s.notes}</div>}
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
                .map(r=>({ ...r, days:getDaysUntil(r.due_date), vehicle:vehicles.find(v=>v.id===r.vehicle_id) }))
                .filter(r => group==="Overdue" ? r.days<0 : group==="This Month" ? r.days>=0&&r.days<=30 : r.days>30&&r.days<9999)
                .sort((a,b)=>a.days-b.days);
              if (!grouped.length) return null;
              return (
                <div key={group} style={{ marginBottom:20 }}>
                  <div style={{ fontSize:13, color:group==="Overdue"?"#ef4444":group==="This Month"?"#f97316":MUTED, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:10 }}>{group}</div>
                  {grouped.map(r=><ReminderCard key={r.id} r={r} showDone={true}/>)}
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
                    <div><div style={{ fontWeight:800, fontSize:16 }}>{v.name}</div><div style={{ fontSize:12, color:MUTED }}>{v.plate} · {v.year}</div></div>
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
      {modal==="service" && (
        <Modal title="Add Service Record" onClose={closeModal}>
          <FF label="Vehicle">
            <select style={IS} onChange={e=>setForm(f=>({ ...f, vehicle_id:e.target.value }))}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v=><option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
            </select>
          </FF>
          <FF label="Service Type">
            <ServiceTypePicker value={form.type} onChange={val=>setForm(f=>({ ...f, type:val }))} serviceTypes={serviceTypes} onAddType={addServiceType}/>
          </FF>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <FF label="Date"><input type="date" style={IS} onChange={e=>setForm(f=>({ ...f, date:e.target.value }))}/></FF>
            <FF label="Odometer (km)"><input type="number" style={IS} placeholder="e.g. 45000" onChange={e=>setForm(f=>({ ...f, odometer:e.target.value }))}/></FF>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <FF label="Cost (RM)"><input type="number" style={IS} placeholder="0.00" onChange={e=>setForm(f=>({ ...f, cost:e.target.value }))}/></FF>
            <FF label="Workshop"><input type="text" style={IS} placeholder="Name or DIY" onChange={e=>setForm(f=>({ ...f, workshop:e.target.value }))}/></FF>
          </div>
          <FF label="Notes"><textarea style={{ ...IS, minHeight:60, resize:"vertical" }} onChange={e=>setForm(f=>({ ...f, notes:e.target.value }))}/></FF>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":"Save Record"} onClick={saveService} disabled={saving}/>
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

      {modal==="reminder" && (
        <Modal title="Add Reminder" onClose={closeModal}>
          <FF label="Vehicle">
            <select style={IS} onChange={e=>setForm(f=>({ ...f, vehicle_id:e.target.value }))}>
              <option value="">Select vehicle...</option>
              {vehicles.map(v=><option key={v.id} value={v.id}>{v.name} ({v.plate})</option>)}
            </select>
          </FF>
          <FF label="Service Type">
            <ServiceTypePicker value={form.type} onChange={val=>setForm(f=>({ ...f, type:val }))} serviceTypes={serviceTypes} onAddType={addServiceType}/>
          </FF>
          <RecurringConfig form={form} setForm={setForm}/>
          {form.recur_type==="mileage" && form.last_done_odo && form.recur_value && (
            <div style={{ background:"#22c55e11", border:"1px solid #22c55e44", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:13, color:"#22c55e" }}>
              🔧 Next due odometer: <strong>{(parseInt(form.last_done_odo)+parseInt(form.recur_value)).toLocaleString()} km</strong>
            </div>
          )}
          {form.recur_type==="schedule" && form.last_done_date && form.recur_value && (
            <div style={{ background:"#22c55e11", border:"1px solid #22c55e44", borderRadius:8, padding:"10px 12px", marginBottom:14, fontSize:13, color:"#22c55e" }}>
              📅 Next due date: <strong>{calcNextDueDate(form.last_done_date, parseInt(form.recur_value))||"—"}</strong>
            </div>
          )}
          <FF label="Due Date *">
            <input type="date" style={IS} value={form.due_date||""} onChange={e=>setForm(f=>({ ...f, due_date:e.target.value }))}/>
          </FF>
          <FF label="Notes">
            <textarea style={{ ...IS, minHeight:50, resize:"vertical" }} onChange={e=>setForm(f=>({ ...f, notes:e.target.value }))}/>
          </FF>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":"Save Reminder"} onClick={saveReminder} disabled={saving}/>
          </div>
        </Modal>
      )}

      {modal==="vehicle" && (
        <Modal title="Add Car" onClose={closeModal}>
          <FF label="Car Name"><input type="text" style={IS} placeholder="e.g. Perodua Myvi" onChange={e=>setForm(f=>({ ...f, name:e.target.value }))}/></FF>
          <FF label="Plate Number"><input type="text" style={IS} placeholder="e.g. BCD 1234" onChange={e=>setForm(f=>({ ...f, plate:e.target.value }))}/></FF>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <FF label="Year"><input type="number" style={IS} placeholder="2020" onChange={e=>setForm(f=>({ ...f, year:e.target.value }))}/></FF>
            <FF label="Color"><input type="color" style={{ ...IS, height:42, padding:4 }} defaultValue="#6366f1" onChange={e=>setForm(f=>({ ...f, color:e.target.value }))}/></FF>
          </div>
          <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
            <Btn label="Cancel" onClick={closeModal} variant="secondary"/>
            <Btn label={saving?"Saving...":"Add Car"} onClick={saveVehicle} disabled={saving}/>
          </div>
        </Modal>
      )}
    </div>
  );
}
