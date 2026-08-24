const json = async (res) => {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.error || res.statusText);
  return data;
};

export const api = {
  status: () => fetch("/api/status").then(json),
  catalog: () => fetch("/api/catalog").then(json),
  scan: () => fetch("/api/scan", { method: "POST" }).then(json),
  connect: (address) =>
    fetch("/api/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    }).then(json),
  disconnect: () => fetch("/api/disconnect", { method: "POST" }).then(json),
  power: (on) =>
    fetch("/api/power", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ on }),
    }).then(json),
  color: (r, g, b, zone) =>
    fetch("/api/color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ r, g, b, zone }),
    }).then(json),
  brightness: (level, zone) =>
    fetch("/api/brightness", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, zone }),
    }).then(json),
  rgbMode: (index) =>
    fetch("/api/rgb-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ index }),
    }).then(json),
  symphony: (kind, mode) =>
    fetch("/api/symphony", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, mode }),
    }).then(json),
  speed: (level, family = "both") =>
    fetch("/api/speed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level, family }),
    }).then(json),
};
