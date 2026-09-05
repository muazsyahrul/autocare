const BASE = "/api";

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data;
}

// ─── Database Backup / Restore ────────────────────────────────────────────────

async function exportDatabase(password) {
  const res = await fetch(`${BASE}/database/export`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    let message = "Database export failed";

    try {
      const json = await res.json();
      message = json.error || message;
    } catch {}

    throw new Error(message);
  }

  const blob = await res.blob();

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "garage.db";

  document.body.appendChild(a);
  a.click();
  a.remove();

  window.URL.revokeObjectURL(url);
}

async function importDatabase(file, password) {
  if (!file) {
    throw new Error("Please select a database file");
  }

  const res = await fetch(`${BASE}/database/import`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/octet-stream",
      "X-AutoCare-Password": password,
    },
    body: file,
  });

  const json = await res.json();

  if (!json.ok) {
    throw new Error(json.error || "Database import failed");
  }

  return json.data;
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────
export const api = {
  // Authentication
  login:           (username, password) => req("POST", "/auth/login", { username, password }),
  me:              () => req("GET", "/auth/me"),
  logout:           () => req("POST", "/auth/logout"),

  // Vehicles
  getVehicles:     ()      => req("GET",    "/vehicles"),
  createVehicle:   (data)  => req("POST",   "/vehicles", data),
  updateVehicle:   (id, d) => req("PUT",    `/vehicles/${id}`, d),
  deleteVehicle:   (id)    => req("DELETE", `/vehicles/${id}`),

  // Services
  getServices:     (params={}) => req("GET", "/services?" + new URLSearchParams(params)),
  createService:   (data)      => req("POST",   "/services", data),
  updateService:   (id, d)     => req("PUT",    `/services/${id}`, d),
  deleteService:   (id)        => req("DELETE", `/services/${id}`),

  // Fuels
  getFuels:        (params={}) => req("GET", "/fuels?" + new URLSearchParams(params)),
  createFuel:      (data)      => req("POST",   "/fuels", data),
  updateFuel:      (id, d)     => req("PUT",    `/fuels/${id}`, d),
  deleteFuel:      (id)        => req("DELETE", `/fuels/${id}`),

  // Reminders (read-only; generated from service records)
  getReminders:    (params={}) => req("GET", "/reminders?" + new URLSearchParams(params)),

  // Service Types
  getServiceTypes:   ()     => req("GET",    "/service-types"),
  createServiceType: (name) => req("POST",   "/service-types", { name }),
  deleteServiceType: (id)   => req("DELETE", `/service-types/${id}`),

  // Settings
  getSettings:    ()     => req("GET", "/settings"),
  updateSettings: (data) => req("PUT", "/settings", data),

  // Database Backup / Restore
  exportDatabase,
  importDatabase,
};

