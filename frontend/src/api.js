const BASE = "/api";

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Request failed");
  return json.data;
}

// ─── Vehicles ─────────────────────────────────────────────────────────────────
export const api = {
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
};
