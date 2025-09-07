import { useEffect, useMemo, useRef, useState } from "react";
import { connectSolace, subscribe } from "@/lib/solace";
import MapView from "@/components/MapView";
import type { Incident, Agency, Severity } from "@/types";

const AGENCIES: Agency[] = ["police", "hospitals", "nonprofits"];
const typeToAgencies: Record<string, Agency[]> = {
  accident: ["police", "hospitals"],
  disease: ["hospitals", "nonprofits"],
  flood: ["nonprofits", "police"],
  assault: ["police"],
  earthquake: ["police", "hospitals", "nonprofits"],
};
const getAgencies = (e: Incident): Agency[] =>
  e.agencyTargets ?? typeToAgencies[(e.type ?? "").toLowerCase()] ?? ["nonprofits"];

export default function App() {
  const [events, setEvents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [severityFilter, setSeverityFilter] = useState<Severity | "all">("all");
  const [activeAgency, setActiveAgency] = useState<Agency | "all">("all");

  // keep the session just to disconnect on unmount
  const sessionRef = useRef<unknown>(null);

  const topic = useMemo(() => (import.meta.env.VITE_SOLACE_TOPIC as string) ?? "crisis/>", []);
  const url = import.meta.env.VITE_SOLACE_URL as string | undefined;
  const vpnName = import.meta.env.VITE_SOLACE_VPN as string | undefined;
  const userName = import.meta.env.VITE_SOLACE_USER as string | undefined;
  const password = import.meta.env.VITE_SOLACE_PASS as string | undefined;

  useEffect(() => {
    // If env vars are missing, skip connecting (you can still Inject Test Event)
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
          // trust backend schema; cast to Incident for UI
          setEvents((prev) => [e as Incident, ...prev].slice(0, 300));
        });
        setStatus("connected");
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    })();
    return () => {
      mounted = false;
      try {
        (sessionRef.current as { disconnect?: () => void } | null)?.disconnect?.();
      } catch {
        /* noop */
      }
    };
  }, [topic, url, vpnName, userName, password]);

  const visible = events.filter((e) => {
    const sevOk = severityFilter === "all" || (e.severity ?? "").toLowerCase() === severityFilter;
    const agOk = activeAgency === "all" || getAgencies(e).includes(activeAgency);
    return sevOk && agOk;
  });

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Crisis Ops — Live Feed</h1>
          <StatusBadge status={status} />
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
              className={`px-2 py-1 rounded border text-sm ${severityFilter === s ? "bg-slate-900 text-white" : "bg-white hover:bg-gray-50"
                }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-medium mr-2">Agency:</div>
          {(["all", ...AGENCIES] as const).map((a) => (
            <button
              key={a}
              onClick={() => setActiveAgency(a)}
              className={`px-3 py-1.5 rounded-full border text-sm ${activeAgency === a ? "bg-slate-900 text-white" : "bg-white hover:bg-gray-50"
                }`}
            >
              {String(a).charAt(0).toUpperCase() + String(a).slice(1)}
            </button>
          ))}
        </div>

        {/* Map */}
        <MapView events={visible} />

        <FilterHint />

        {/* Demo button (works even without real Solace creds) */}
        <button
          onClick={() =>
            setEvents((prev) => [
              {
                id: "local_" + crypto.randomUUID().slice(0, 6),
                ts: new Date().toISOString(),
                type: "flood",
                severity: "high",
                headline: "Flash flooding near Bank St.",
                location: { lat: 45.4215, lng: -75.6972, city: "Ottawa", country: "CA" },
              },
              ...prev,
            ])
          }
          className="border rounded px-2 py-1 text-sm w-fit hover:bg-gray-50"
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
          {visible.map((e, i) => (
            <li key={(e.id ?? i) + String(e.ts)} className="border rounded-lg p-3 hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <div className="font-medium">
                  {(e.type ?? "event").toUpperCase()} · {e.severity ?? "unknown"}
                </div>
                <div className="text-xs text-gray-500">{e.ts ?? ""}</div>
              </div>
              <div className="text-sm text-gray-700">{e.headline || e.summary || "—"}</div>
              {e.location && (
                <div className="text-xs text-gray-500 mt-1">
                  {e.location.city ?? ""}
                  {e.location.city ? ", " : ""}
                  {e.location.country ?? ""} {" · "}
                  {e.location.lat?.toFixed(4)}, {e.location.lng?.toFixed(4)}
                </div>
              )}
              <div className="text-xs text-gray-500 mt-1">
                Routed to: {getAgencies(e).map((a) => a[0].toUpperCase() + a.slice(1)).join(", ")}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: "idle" | "connecting" | "connected" | "error" }) {
  const cls = {
    idle: "bg-gray-100 text-gray-700",
    connecting: "bg-yellow-100 text-yellow-700",
    connected: "bg-green-100 text-green-700",
    error: "bg-red-100 text-red-700",
  }[status];
  return <span className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded ${cls}`}>{status.toUpperCase()}</span>;
}

function FilterHint() {
  return (
    <div className="rounded-lg border p-3 bg-gray-50">
      <div className="text-sm">
        <strong>Subscribed:</strong>{" "}
        <code className="bg-white px-1 rounded border">{import.meta.env.VITE_SOLACE_TOPIC}</code>
      </div>
      <div className="text-xs text-gray-600 mt-1">
        You’ll add filters, map, and agency tabs next. For now this verifies <em>real-time</em> delivery from Solace.
      </div>
    </div>
  );
}
