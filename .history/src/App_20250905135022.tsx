import { useEffect, useMemo, useRef, useState } from "react";
import { connectSolace, subscribe, publishAck, publishAssign, publishEscalate, publishResolve } from "@/lib/solace";
import MapView from "@/components/MapView";
import Analytics from "@/components/Analytics";
import AgencyQueues from "@/components/AgencyQueues";
import IncidentDrawer from "@/components/IncidentDrawer";
import { ToastProvider, useToast } from "@/components/Toaster";
import type { Incident, Agency, Severity } from "@/types";
import { routeAgencies } from "@/lib/routing";

/** --- Constants & Labels --- */
const AGENCIES: Agency[] = ["law", "fire", "ems", "hospitals", "utilities", "transport", "ngos"];
const CORE_TABS: Agency[] = ["law", "fire", "ems", "hospitals", "utilities", "transport"]; // NGOs appear when relevant

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

/** --- Small helpers --- */
function randomIncident(): Incident {
  const severities: Severity[] = ["low", "med", "high", "critical"];
  const types = ["flood", "accident", "assault", "disease", "earthquake", "fire"] as const;
  const sev = severities[Math.floor(Math.random() * severities.length)];
  const typ = types[Math.floor(Math.random() * types.length)];
  const base = { lat: 45.4215, lng: -75.6972 }; // Ottawa area
  const jitter = (n: number) => (Math.random() - 0.5) * n;
  const lat = base.lat + jitter(0.25);
  const lng = base.lng + jitter(0.4);
  const injured = Math.random() < 0.35 ? Math.floor(Math.random() * 3) : 0;
  const lanes = Math.random() < 0.4 ? Math.floor(Math.random() * 3) : 0;

  return {
    id: "sim_" + crypto.randomUUID().slice(0, 6),
    ts: new Date().toISOString(),
    type: typ,
    severity: sev,
    headline: `${typ[0].toUpperCase() + (typ as string).slice(1)} reported`,
    summary: "Automatically simulated event for demo.",
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

/** --- Inner App with toast access --- */
function AppInner() {
  const { push } = useToast();

  const [events, setEvents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [activeAgency, setActiveAgency] = useState<Agency | "all">("all");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
  const [simulate, setSimulate] = useState(false);
  const [dark, setDark] = useState(false);

  // recent ids to “pulse” on the map briefly
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const sessionRef = useRef<unknown>(null);
  const topic = useMemo(() => (import.meta.env.VITE_SOLACE_TOPIC as string) ?? "crisis/>", []);
  const url = import.meta.env.VITE_SOLACE_URL as string | undefined;
  const vpnName = import.meta.env.VITE_SOLACE_VPN as string | undefined;
  const userName = import.meta.env.VITE_SOLACE_USER as string | undefined;
  const password = import.meta.env.VITE_SOLACE_PASS as string | undefined;

  // Dark mode toggle
  useEffect(() => {
    const root = document.documentElement;
    if (dark) root.classList.add("dark");
    else root.classList.remove("dark");
  }, [dark]);

  // Real-time connect (if env present)
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
          const inc = e as Incident;
          setEvents((prev) => [inc, ...prev].slice(0, 500));
          if (inc.id) {
            setRecentIds((r) => [inc.id!, ...r].slice(0, 20));
            setTimeout(() => setRecentIds((r) => r.filter((id) => id !== inc.id)), 2500);
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
      try { (sessionRef.current as { disconnect?: () => void } | null)?.disconnect?.(); } catch { }
    };
  }, [topic, url, vpnName, userName, password]);

  // Demo mode: auto-simulated stream
  useEffect(() => {
    if (!simulate) return;
    const id = setInterval(() => {
      const inc = randomIncident();
      setEvents((prev) => [inc, ...prev].slice(0, 500));
      setRecentIds((r) => [inc.id!, ...r].slice(0, 20));
      setTimeout(() => setRecentIds((r) => r.filter((x) => x !== inc.id), 2400));
    }, 1500);
    return () => clearInterval(id);
  }, [simulate]);

  const visible = events.filter((e) => {
    const sevOk = severityFilter === "all" || (e.severity ?? "").toLowerCase() === severityFilter;
    const agOk = activeAgency === "all" || routeAgencies(e).includes(activeAgency);
    return sevOk && agOk;
  });

  // Tabs: show core 6, plus NGOs only if present
  const activeAgencySet = new Set(visible.flatMap(routeAgencies));
  const tabs = CORE_TABS.concat(activeAgencySet.has("ngos") ? (["ngos"] as Agency[]) : []);

  // Commands
  async function handleAction(a: "ack" | "assign" | "escalate" | "resolve", inc: Incident) {
    const id = inc.id ?? "";
    const s = sessionRef.current as any;
    try {
      if (a === "ack") await publishAck(s, id, "ui");
      if (a === "assign") await publishAssign(s, id, "ui");
      if (a === "escalate") await publishEscalate(s, id, "ui");
      if (a === "resolve") await publishResolve(s, id, "ui");
      push(`${a[0].toUpperCase() + a.slice(1)} sent`);
    } catch {
      push(`Failed to send ${a}`);
    }
  }

  const selected = selectedId ? events.find(e => e.id === selectedId) : undefined;

  return (
    <main className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur dark:bg-slate-950/80 dark:border-slate-800">
        <div className="max-w-6xl mx-auto p-4 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">Crisis Ops — Real-Time</h1>
            <span className={`text-xs px-2 py-1 rounded ${{
                idle: "bg-gray-100 text-gray-700", connecting: "bg-yellow-100 text-yellow-700",
                connected: "bg-green-100 text-green-700", error: "bg-red-100 text-red-700"
              }[status]
              }`}>{status.toUpperCase()}</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={simulate} onChange={(e) => setSimulate(e.target.checked)} />
              Auto-simulate
            </label>
            <label className="text-xs flex items-center gap-2">
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} />
              Dark
            </label>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid gap-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium mr-2">Severity:</div>
          {(["all", "low", "med", "high", "critical"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={`px-2 py-1 rounded text-sm ${SEV_BTN[s]} ${severityFilter === s ? "ring-2" : ""}`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium mr-2">Agency:</div>
          <button
            onClick={() => setActiveAgency("all")}
            className={`px-3 py-1.5 rounded-full border text-sm ${activeAgency === "all" ? "bg-slate-900 text-white" : "bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800"}`}
          >
            All
          </button>
          {tabs.map((a) => (
            <button
              key={a}
              onClick={() => setActiveAgency(a)}
              className={`px-3 py-1.5 rounded-full border text-sm ${activeAgency === a ? "bg-slate-900 text-white" : "bg-white hover:bg-gray-50 dark:bg-slate-900 dark:hover:bg-slate-800"}`}
            >
              {AGENCY_LABEL[a]}
              <span className="ml-2 text-[11px] text-gray-500">
                ({visible.filter(e => routeAgencies(e).includes(a)).length})
              </span>
            </button>
          ))}
        </div>

        {/* Analytics */}
        <Analytics events={visible} />

        {/* Map */}
        <MapView events={visible} selectedId={selectedId} onSelect={setSelectedId} recentIds={recentIds} />

        {/* Subscribed hint */}
        <div className="rounded-lg border p-3 bg-gray-50 dark:bg-slate-900 dark:border-slate-800">
          <div className="text-sm">
            <strong>Subscribed:</strong>{" "}
            <code className="bg-white dark:bg-slate-800 px-1 rounded border dark:border-slate-700">{import.meta.env.VITE_SOLACE_TOPIC}</code>
          </div>
          <div className="text-xs text-gray-600 dark:text-slate-400 mt-1">
            Use demo mode if the broker is offline. Click a card to center the map and open the drawer.
          </div>
        </div>

        {/* Inject (manual) */}
        <button
          onClick={() => {
            const inc = randomIncident();
            setEvents((prev) => [inc, ...prev].slice(0, 500));
            setRecentIds((r) => [inc.id!, ...r].slice(0, 20));
            setTimeout(() => setRecentIds((r) => r.filter((x) => x !== inc.id), 2400));
          }}
          className="border rounded px-2 py-1 text-sm w-fit hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          Inject Test Event
        </button>

        {/* List */}
        <ul className="grid gap-3">
          {visible.length === 0 && (
            <li className="text-sm text-gray-500">
              No events match your filters. Subscribed to{" "}
              <code className="bg-gray-100 px-1 rounded">{topic}</code>.
            </li>
          )}
          {visible.map((e, i) => {
            const id = e.id ?? `idx-${i}`;
            const sev = (e.severity ?? "low").toLowerCase() as Severity;
            return (
              <li
                key={id + String(e.ts)}
                onClick={() => setSelectedId(id)}
                className={`border rounded-lg p-3 hover:shadow-sm transition cursor-pointer dark:border-slate-700 ${selectedId === id ? "ring-2 ring-slate-300" : ""
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEV_DOT[sev]}`} />
                    {(e.type ?? "event").toUpperCase()} · {e.severity ?? "unknown"}
                  </div>
                  <div className="text-xs text-gray-500">{e.ts ?? ""}</div>
                </div>
                <div className="text-sm text-gray-700 dark:text-slate-200">{e.headline || e.summary || "—"}</div>
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

        {/* Queues */}
        <AgencyQueues events={visible} agencies={tabs} />
      </div>

      {/* Drawer */}
      <IncidentDrawer
        open={!!selected}
        incident={selected}
        onClose={() => setSelectedId(undefined)}
        onAction={(a) => selected && handleAction(a, selected)}
      />
    </main>
  );
}

/** --- Export with Toast provider wrapper --- */
export default function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}
