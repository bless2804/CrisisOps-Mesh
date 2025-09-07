import type { Incident } from "@/types";
import MapView from "@/components/MapView";
import { useEffect, useMemo, useRef, useState } from "react";
import { connectSolace, subscribe } from "@/lib/solace";

type Incident = {
  id?: string; ts?: string; type?: string; severity?: string;
  headline?: string; summary?: string;
  location?: { lat: number; lng: number; city?: string; country?: string };
};

export default function App() {
  const [events, setEvents] = useState<Incident[]>([]);
  const [status, setStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const sessionRef = useRef<any>(null);

  const topic = useMemo(() => import.meta.env.VITE_SOLACE_TOPIC as string, []);
  const url = import.meta.env.VITE_SOLACE_URL as string;
  const vpnName = import.meta.env.VITE_SOLACE_VPN as string;
  const userName = import.meta.env.VITE_SOLACE_USER as string;
  const password = import.meta.env.VITE_SOLACE_PASS as string;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setStatus("connecting");
        const session = await connectSolace({ url, vpnName, userName, password });
        if (!mounted) return;
        sessionRef.current = session;
        await subscribe(session, topic, (e) => {
          setEvents((prev) => [e as Incident, ...prev].slice(0, 100));
        });
        setStatus("connected");
      } catch (e) {
        console.error(e);
        setStatus("error");
      }
    })();
    return () => {
      mounted = false;
      try { sessionRef.current?.disconnect(); } catch { }
    };
  }, [topic, url, vpnName, userName, password]);

  return (
    <main className="min-h-screen bg-white">
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="max-w-6xl mx-auto p-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">Crisis Ops — Live Feed</h1>
          <StatusBadge status={status} />
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-4 grid gap-4">
        <FilterHint />
        <button
          onClick={() =>
            setEvents(prev => [{
              id: "local_test",
              ts: new Date().toISOString(),
              type: "flood",
              severity: "high",
              headline: "Flash flooding near Bank St.",
              location: { lat: 45.4215, lng: -75.6972, city: "Ottawa", country: "CA" }
            }, ...prev])
          }
          className="border rounded px-2 py-1 text-sm w-fit hover:bg-gray-50"
        >
          Inject Test Event
        </button>
        <ul className="grid gap-3">
          {events.length === 0 && (
            <li className="text-sm text-gray-500">
              No events yet. Once your backend publishes to <code className="bg-gray-100 px-1 rounded">{topic}</code>, they’ll appear here instantly.
            </li>
          )}
          {events.map((e, i) => (
            <li key={(e.id ?? i) + String(e.ts)} className="border rounded-lg p-3 hover:shadow-sm transition">
              <div className="flex items-center justify-between">
                <div className="font-medium">{(e.type ?? "event").toUpperCase()} · {e.severity ?? "unknown"}</div>
                <div className="text-xs text-gray-500">{e.ts ?? ""}</div>
              </div>
              <div className="text-sm text-gray-700">{e.headline || e.summary || "—"}</div>
              {e.location && (
                <div className="text-xs text-gray-500 mt-1">
                  {e.location.city ?? ""}{e.location.city ? ", " : ""}{e.location.country ?? ""}
                  {" · "}
                  {e.location.lat?.toFixed(4)}, {e.location.lng?.toFixed(4)}
                </div>
              )}
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
  return (
    <span className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded ${cls}`}>
      {status.toUpperCase()}
    </span>
  );
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
