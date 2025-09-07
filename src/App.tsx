import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  connectSolace,
  subscribe,
  publishAck,
  publishAssign,
  publishEscalate,
  publishResolve,
} from "@/lib/solace";
import MapView from "@/components/MapView";
import Analytics from "@/components/Analytics";
import AgencyQueues from "@/components/AgencyQueues";
import IncidentDrawer from "@/components/IncidentDrawer";
import { ToastProvider, useToast } from "@/components/Toaster";
import type { Incident, Agency, Severity } from "@/types";
import { routeAgencies } from "@/lib/routing";

/** --- Constants --- */
const CORE_TABS: Agency[] = ["law", "fire", "ems", "hospitals", "utilities", "transport", "ngos"];
const AGENCY_LABEL: Record<Agency, string> = {
  law: "Police",
  fire: "Fire & Rescue",
  ems: "EMS (Ambulance)",
  hospitals: "Hospitals",
  utilities: "Public Works / Utilities",
  transport: "Transportation Authority",
  ngos: "Relief & NGOs",
};
const SEV_BTN: Record<"all" | Severity, string> = {
  all: "bg-slate-100 text-slate-800 ring-1 ring-slate-200",
  low: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  med: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  high: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
  critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
};
const SEV_DOT: Record<Severity, string> = {
  low: "bg-emerald-500",
  med: "bg-amber-500",
  high: "bg-orange-500",
  critical: "bg-red-500",
};
const COMMANDS_ENABLED = (import.meta.env.VITE_ENABLE_COMMANDS ?? "false") === "true";

function AppInner() {
  const { push } = useToast();

  const [events, setEvents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [activeAgency, setActiveAgency] = useState<Agency | "all">("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  const [recentIds, setRecentIds] = useState<string[]>([]);
  const dropUntilRef = useRef<number>(0);
  const pauseUntilRef = useRef<number>(0);

  const sessionRef = useRef<unknown>(null);
  const topic = useMemo(() => (import.meta.env.VITE_SOLACE_TOPIC as string) ?? "crisis/>", []);
  const url = import.meta.env.VITE_SOLACE_URL as string | undefined;
  const vpnName = import.meta.env.VITE_SOLACE_VPN as string | undefined;
  const userName = import.meta.env.VITE_SOLACE_USER as string | undefined;
  const password = import.meta.env.VITE_SOLACE_PASS as string | undefined;

  useEffect(() => {
    if (!url || !vpnName || !userName || !password) {
      setStatus("error");
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setStatus("connecting");
        const session = await connectSolace({ url, vpnName, userName, password });
        if (!mounted) return;
        sessionRef.current = session;
        await subscribe(session as any, topic, (e) => {
          const now = Date.now();
          if (now < dropUntilRef.current || now < pauseUntilRef.current) return;
          const inc = e as Incident;
          setEvents((prev) => [inc, ...prev].slice(0, 500));
          if (inc.id) {
            setRecentIds((r) => [inc.id!, ...r].slice(0, 20));
            setTimeout(() => setRecentIds((r) => r.filter((id) => id !== inc.id)), 2400);
          }
        });
        setStatus("connected");
      } catch (err) {
        console.error(err);
        setStatus("error");
      }
    })();
    return () => {
      mounted = false;
      try {
        (sessionRef.current as { disconnect?: () => void } | null)?.disconnect?.();
      } catch {}
    };
  }, [topic, url, vpnName, userName, password]);

  /** Visible list after applying BOTH filters (used by lists/map/drawer) */
  const visible = useMemo(() => {
    return events.filter((e) => {
      const sevOk = severityFilter === "all" || (e.severity ?? "").toLowerCase() === severityFilter;
      const agOk = activeAgency === "all" || routeAgencies(e).includes(activeAgency);
      return sevOk && agOk;
    });
  }, [events, severityFilter, activeAgency]);

  /** Counts for filter chips (each respects the OTHER filter) */
  const severityCounts = useMemo(() => {
    const counts = { low: 0, med: 0, high: 0, critical: 0 } as Record<Severity, number>;
    const base = activeAgency === "all" ? events : events.filter((e) => routeAgencies(e).includes(activeAgency));
    for (const e of base) {
      const sev = (e.severity ?? "low").toLowerCase() as Severity;
      if (counts[sev] != null) counts[sev] += 1;
    }
    return counts;
  }, [events, activeAgency]);

  const agencyCounts = useMemo(() => {
    const counts: Record<Agency, number> = {
      law: 0, fire: 0, ems: 0, hospitals: 0, utilities: 0, transport: 0, ngos: 0,
    };
    const base =
      severityFilter === "all" ? events : events.filter((e) => (e.severity ?? "").toLowerCase() === severityFilter);
    for (const e of base) for (const a of routeAgencies(e)) counts[a] += 1;
    return counts;
  }, [events, severityFilter]);

  // Better “All” number for Agency row = how many incidents remain after severity filter
  const allAgencyCount =
    severityFilter === "all" ? events.length : events.filter((e) => (e.severity ?? "").toLowerCase() === severityFilter).length;

  async function handleAction(a: "ack" | "assign" | "escalate" | "resolve", inc: Incident) {
    if (!((import.meta.env.VITE_ENABLE_COMMANDS ?? "false") === "true")) return;
    const s = sessionRef.current as any;
    if (!s) return;
    const id = inc.id ?? "";
    if (a === "ack") await publishAck(s, id, "ui");
    if (a === "assign") await publishAssign(s, id, "ui");
    if (a === "escalate") await publishEscalate(s, id, "ui");
    if (a === "resolve") await publishResolve(s, id, "ui");
  }

  const selected = selectedId ? events.find((e) => e.id === selectedId) : undefined;

  /** Strong Reset */
  function resetAll() {
    setEvents([]);
    setRecentIds([]);
    setSelectedId(undefined);
    setSeverityFilter("all");
    setActiveAgency("all");

    const now = Date.now();
    const blockMs = 8000;
    dropUntilRef.current = now + blockMs;
    pauseUntilRef.current = now + blockMs;

    setTimeout(() => setEvents([]), 0);
    setTimeout(() => setEvents([]), 120);
  }

  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Header */}
      <header className="sticky top-0 z-[3000] border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto p-4 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Crisis Operations Console</h1>
            <span
              className={clsx(
                "text-xs px-2 py-1 rounded",
                status === "idle" && "bg-gray-100 text-gray-700",
                status === "connecting" && "bg-yellow-100 text-yellow-700",
                status === "connected" && "bg-green-100 text-green-700",
                status === "error" && "bg-red-100 text-red-700"
              )}
            >
              {status.toUpperCase()}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={resetAll} className="text-xs px-2 py-1 rounded border hover:bg-gray-50">
              Reset
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid gap-4">
        {/* ===== Filters directly under the header ===== */}
        <div className="space-y-3">
          {/* Severity row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium mr-1">Severity:</div>
            {(["all", "low", "med", "high", "critical"] as const).map((s) => {
              const c =
                s === "all"
                  ? severityCounts.low + severityCounts.med + severityCounts.high + severityCounts.critical
                  : severityCounts[s];
              return (
                <button
                  key={s}
                  onClick={() => setSeverityFilter(s)}
                  className={clsx(
                    "px-2 py-1 rounded text-sm whitespace-nowrap",
                    SEV_BTN[s],
                    severityFilter === s && "ring-2"
                  )}
                  title={`Filter by ${s}`}
                >
                  {s.toUpperCase()} <span className="text-[11px] text-gray-600">({c})</span>
                </button>
              );
            })}
          </div>

          {/* Agency row */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-medium mr-1">Agency:</div>
            <button
              onClick={() => setActiveAgency("all")}
              className={clsx(
                "px-4 h-9 inline-flex items-center gap-1 rounded-full border text-sm whitespace-nowrap leading-none shrink-0",
                activeAgency === "all" ? "bg-slate-900 text-white" : "bg-white hover:bg-gray-50"
              )}
              title="Show all agencies"
            >
              All <span className={activeAgency === "all" ? "opacity-90" : "text-gray-500"}>({allAgencyCount})</span>
            </button>
            {CORE_TABS.map((a) => (
              <button
                key={a}
                onClick={() => setActiveAgency(a)}
                className={clsx(
                  "px-4 h-9 inline-flex items-center gap-1 rounded-full border text-sm whitespace-nowrap leading-none shrink-0",
                  activeAgency === a ? "bg-slate-900 text-white" : "bg-white hover:bg-gray-50"
                )}
                title={AGENCY_LABEL[a]}
              >
                {AGENCY_LABEL[a]} <span className={activeAgency === a ? "opacity-90" : "text-gray-500"}>({(agencyCounts as any)[a] ?? 0})</span>
              </button>
            ))}
          </div>
        </div>

        {/* ===== Section: Analytics ===== */}
        <div className="mt-1">
          <div className="text-lg font-semibold">Operational Overview</div>
          <div className="text-sm text-slate-600">
            Current incident distribution by severity and activity over the last 10 minutes.
          </div>
        </div>

        <Analytics events={visible} />

        {/* ===== Section: Map ===== */}
        <div className="mt-2">
          <div className="text-lg font-semibold">Live Incident Map</div>
          <div className="text-sm text-slate-600">
            Real-time geospatial view. Click a marker to open details; zoom is preserved during interaction.
          </div>
        </div>

        <MapView
          events={visible}
          selectedId={selectedId}
          onSelect={setSelectedId}
          recentIds={recentIds}
        />

        {/* ===== Section: Agency Queues ===== */}
        <div className="mt-2">
          <div className="text-lg font-semibold">Agency Queues</div>
          <div className="text-sm text-slate-600">
            Live routing of incidents to the appropriate departments.
          </div>
        </div>

        <AgencyQueues events={visible} agencies={CORE_TABS} onSelect={setSelectedId} />

        {/* ===== Section: Incident Feed ===== */}
        <div className="mt-2">
          <div className="text-lg font-semibold">Incident Feed</div>
          <div className="text-sm text-slate-600">
            Chronological list of incoming incidents. Click to view details and focus on the map.
          </div>
        </div>

        <ul className="grid gap-3">
          {visible.length === 0 && <li className="text-sm text-gray-500">No events match your filters.</li>}
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
                title="Open incident"
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    <span className={clsx("inline-block h-2.5 w-2.5 rounded-full", SEV_DOT[sev])} />
                    {(e.type ?? "event").toUpperCase()} · {e.severity ?? "unknown"}
                  </div>
                  <div className="text-xs text-gray-500">{e.ts ?? ""}</div>
                </div>
                <div className="text-sm text-slate-700">{e.headline || e.summary || "—"}</div>
                {e.location && (
                  <div className="text-xs text-gray-500 mt-1">
                    {e.location.city ?? ""}{e.location.city ? ", " : ""}{e.location.country ?? ""} {" · "}
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

      <IncidentDrawer
        open={!!selected}
        incident={selected}
        onClose={() => setSelectedId(undefined)}
      />
    </main>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
