import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import MapView from "@/components/MapView";
import Analytics from "@/components/Analytics";
import AgencyQueues from "@/components/AgencyQueues";
import IncidentDrawer from "@/components/IncidentDrawer";
import { ToastProvider, useToast } from "@/components/Toaster";

import type { Incident, Agency, Severity } from "@/types";
import { routeAgencies } from "@/lib/routing";

/* ---------- Labels & UI helpers ---------- */
const AGENCY_LABEL: Record<Agency, string> = {
  law: "Police",
  fire: "Fire & Rescue",
  ems: "EMS (Ambulance)",
  hospitals: "Hospitals",
  utilities: "Public Works / Utilities",
  transport: "Transportation Authority",
  ngos: "Relief & NGOs",
};

const SEV_DOT: Record<Severity, string> = {
  low: "bg-emerald-500",
  med: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};

const SEV_BTN: Record<"all" | Severity, string> = {
  all: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
  low: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  med: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  high: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
};

const CORE_TABS: Agency[] = [
  "law",
  "fire",
  "ems",
  "hospitals",
  "utilities",
  "transport",
  "ngos",
];

/* ---------- Client-side incident generator ---------- */
function randomIncident(): Incident {
  const severities: Severity[] = ["low", "med", "high", "critical"];
  const types = ["flood", "accident", "assault", "disease", "earthquake", "fire"] as const;

  const sev = severities[Math.floor(Math.random() * severities.length)];
  const typ = types[Math.floor(Math.random() * types.length)];

  const base = { lat: 45.3215, lng: -75.8572 }; // Ottawa-ish
  const jitter = (n: number) => (Math.random() - 0.5) * n;
  const lat = base.lat + jitter(0.35);
  const lng = base.lng + jitter(0.55);

  const injured = Math.random() < 0.35 ? Math.floor(Math.random() * 3) : 0;
  const lanes = Math.random() < 0.4 ? Math.floor(Math.random() * 3) : 0;

  return {
    id: "cli_" + Math.random().toString(16).slice(2, 8),
    ts: new Date().toISOString(),
    type: typ,
    severity: sev,
    headline: `${typ[0].toUpperCase() + (typ as string).slice(1)} reported`,
    summary: "Client-side simulated incident",
    location: { lat, lng, city: "Ottawa", country: "CA" },
    injuredCount: injured,
    lanesBlocked: lanes,
    roadClosed: lanes >= 2,
    gasLeak: typ === "fire" ? Math.random() < 0.2 : false,
    powerOutage: typ === "flood" ? Math.random() < 0.3 : false,
    shelterNeeded: typ === "flood" && sev !== "low" ? Math.random() < 0.4 : false,
    displacedPeople: typ === "flood" ? Math.floor(Math.random() * 200) : 0,
  };
}

/* ---------- Inner App ---------- */
function AppInner() {
  const { push } = useToast();

  // State
  const [events, setEvents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<"idle" | "streaming" | "error">("idle");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [activeAgency, setActiveAgency] = useState<Agency | "all">("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Controls
  const maxEvents = 500; // cap to keep the UI responsive
  const intervalMs = Math.max(
    400,
    parseInt((import.meta.env.VITE_SIM_INTERVAL_MS as string) ?? "1200", 10) || 1200
  );

  const intervalRef = useRef<number | null>(null);

  // Start the client-side stream on mount
  useEffect(() => {
    try {
      setStatus("streaming");
      push("Simulating live incidents (no backend)");
      intervalRef.current = window.setInterval(() => {
        const inc = randomIncident();
        setEvents((prev) => [inc, ...prev].slice(0, maxEvents));
        if (inc.id) {
          setRecentIds((r) => [inc.id, ...r].slice(0, 20));
          window.setTimeout(() => {
            setRecentIds((r) => r.filter((x) => x !== inc.id));
          }, 2400);
        }
      }, intervalMs);
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
    return () => {
      if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived
  const visible = useMemo(() => {
    return events.filter((e) => {
      const sevOk =
        severityFilter === "all" ||
        (e.severity ?? "").toLowerCase() === severityFilter;
      const agOk =
        activeAgency === "all" || routeAgencies(e).includes(activeAgency);
      return sevOk && agOk;
    });
  }, [events, severityFilter, activeAgency]);

  const sevCounts = useMemo(() => {
    const c = { low: 0, med: 0, high: 0, critical: 0 };
    for (const e of events) {
      const s = (e.severity ?? "").toLowerCase() as Severity;
      if (s in c) (c as Record<Severity, number>)[s] += 1;
    }
    return c;
  }, [events]);

  const agencyCounts = useMemo(() => {
    const c: Record<Agency, number> = {
      law: 0,
      fire: 0,
      ems: 0,
      hospitals: 0,
      utilities: 0,
      transport: 0,
      ngos: 0,
    };
    for (const e of events) {
      for (const a of routeAgencies(e)) c[a] += 1;
    }
    return c;
  }, [events]);

  // Reset (clears all lists and selections, stream keeps running)
  function resetAll() {
    setEvents([]);
    setRecentIds([]);
    setSelectedId(undefined);
    setSeverityFilter("all");
    setActiveAgency("all");
  }

  const selected = selectedId ? events.find((e) => e.id === selectedId) : undefined;

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-[3000] border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Crisis Operations Console</h1>
            <span
              className={clsx(
                "text-xs px-2 py-1 rounded",
                status === "idle" && "bg-gray-100 text-gray-700",
                status === "streaming" && "bg-green-100 text-green-700",
                status === "error" && "bg-red-100 text-red-700"
              )}
            >
              {status.toUpperCase()}
            </span>
          </div>

          <button
            onClick={resetAll}
            className="border rounded px-3 py-1 text-sm hover:bg-gray-50"
          >
            Reset
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid gap-4">
        {/* Filters row */}
        <div className="flex flex-col gap-3">
          {/* Severity */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium mr-2">Severity:</div>
            {(["all", "low", "med", "high", "critical"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSeverityFilter(s)}
                className={clsx(
                  "px-2.5 py-1.5 rounded text-sm inline-flex items-center gap-1",
                  SEV_BTN[s],
                  severityFilter === s && "ring-2"
                )}
              >
                <span>{s.toUpperCase()}</span>
                <span className="text-[11px] opacity-70">
                  (
                  {s === "all"
                    ? events.length
                    : s === "low"
                    ? sevCounts.low
                    : s === "med"
                    ? sevCounts.med
                    : s === "high"
                    ? sevCounts.high
                    : sevCounts.critical}
                  )
                </span>
              </button>
            ))}
          </div>

          {/* Agency */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium mr-2">Agency:</div>

            <button
              onClick={() => setActiveAgency("all")}
              className={clsx(
                "px-3 py-1.5 rounded-full border text-sm",
                activeAgency === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-white hover:bg-gray-50"
              )}
            >
              All <span className="text-[11px] opacity-70">({events.length})</span>
            </button>

            {CORE_TABS.map((a) => (
              <button
                key={a}
                onClick={() => setActiveAgency(a)}
                className={clsx(
                  "px-3 py-1.5 rounded-full border text-sm",
                  activeAgency === a
                    ? "bg-slate-900 text-white"
                    : "bg-white hover:bg-gray-50"
                )}
              >
                {AGENCY_LABEL[a]}{" "}
                <span className="text-[11px] opacity-70">
                  ({agencyCounts[a]})
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Analytics */}
        <Analytics events={visible} />

        {/* Map */}
        <MapView
          events={visible}
          selectedId={selectedId}
          onSelect={setSelectedId}
          recentIds={recentIds}
        />

        {/* Agency queues */}
        <h2 className="text-lg font-semibold mt-2">Agency Queues</h2>
        <AgencyQueues events={visible} agencies={CORE_TABS} />

        {/* Event list */}
        <h2 className="text-lg font-semibold">Incidents</h2>
        <ul className="grid gap-3">
          {visible.length === 0 && (
            <li className="text-sm text-gray-500">No events.</li>
          )}
          {visible.map((e, i) => {
            const id = e.id ?? `idx-${i}`;
            const sev = (e.severity ?? "low").toLowerCase() as Severity;
            return (
              <li
                key={id + String(e.ts)}
                onClick={() => setSelectedId(id)}
                className={clsx(
                  "border rounded-lg p-3 hover:shadow-sm transition cursor-pointer",
                  selectedId === id && "ring-2 ring-slate-300"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    <span
                      className={clsx(
                        "inline-block h-2.5 w-2.5 rounded-full",
                        SEV_DOT[sev]
                      )}
                    />
                    {(e.type ?? "event").toUpperCase()} · {e.severity ?? "unknown"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {e.ts ? new Date(e.ts).toLocaleString() : ""}
                  </div>
                </div>
                <div className="text-sm text-gray-800">
                  {e.headline || e.summary || "—"}
                </div>
                {e.location && (
                  <div className="text-xs text-gray-500 mt-1">
                    {e.location.city ?? ""}
                    {e.location.city ? ", " : ""}
                    {e.location.country ?? ""} {" · "}
                    {e.location.lat?.toFixed(4)}, {e.location.lng?.toFixed(4)}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-1">
                  Routed to: {routeAgencies(e).map((a) => AGENCY_LABEL[a]).join(", ")}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Drawer */}
      <IncidentDrawer
        open={!!selected}
        incident={selected}
        onClose={() => setSelectedId(undefined)}
      />
    </main>
  );
}

/* ---------- Export with Toast provider ---------- */
export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
