import type { Agency, Incident, Severity } from "@/types";
import { routeAgencies } from "@/lib/routing";

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

function capacityPct(agency: Agency, count: number): number {
    // Mock: simple deterministic % so it looks believable
    const base = { law: 55, fire: 48, ems: 63, hospitals: 61, utilities: 42, transport: 37, ngos: 52 }[agency] ?? 50;
    return Math.min(95, Math.max(10, base + Math.min(20, Math.round(count * 1.5))));
}

export default function AgencyQueues({ events, agencies }: { events: Incident[]; agencies: Agency[] }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {agencies.map((a) => {
                const list = events.filter((e) => routeAgencies(e).includes(a));
                const cap = capacityPct(a, list.length);
                return (
                    <div key={a} className="border rounded-lg p-3 dark:border-slate-700">
                        <div className="flex items-center justify-between mb-2">
                            <div className="font-medium">{AGENCY_LABEL[a]}</div>
                            <div className="text-xs bg-slate-100 rounded px-2 py-0.5">Capacity: {cap}%</div>
                        </div>
                        <ul className="space-y-2">
                            {list.slice(0, 5).map((e, i) => {
                                const sev = (e.severity ?? "low").toLowerCase() as Severity;
                                return (
                                    <li key={(e.id ?? i) + String(e.ts)} className="text-sm flex items-center gap-2">
                                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${SEV_DOT[sev]}`} />
                                        <span className="truncate">{e.headline ?? e.type ?? "Incident"}</span>
                                        <span className="text-xs text-gray-500 ml-auto">{e.ts?.slice(11, 16) ?? ""}</span>
                                    </li>
                                );
                            })}
                            {list.length === 0 && <li className="text-xs text-gray-500">No items.</li>}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}
