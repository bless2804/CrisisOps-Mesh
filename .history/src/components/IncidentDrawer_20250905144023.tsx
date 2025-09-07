import type { Incident, Severity, Agency } from "@/types";
import { routeAgencies, routeTrace } from "@/lib/routing";

const SEV_BADGE: Record<Severity, string> = {
    low: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
    med: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
    high: "bg-orange-50 text-orange-700 ring-1 ring-orange-200",
    critical: "bg-red-50 text-red-700 ring-1 ring-red-200",
};
const AGENCY_LABEL: Record<Agency, string> = {
    law: "Police",
    fire: "Fire & Rescue",
    ems: "EMS (Ambulance)",
    hospitals: "Hospitals",
    utilities: "Public Works / Utilities",
    transport: "Transportation Authority",
    ngos: "Relief & NGOs",
};

export default function IncidentDrawer({
    open,
    incident,
    onClose,
    onAction,
}: {
    open: boolean;
    incident?: Incident;
    onClose: () => void;
    onAction: (action: "ack" | "assign" | "escalate" | "resolve") => void;
}) {
    return (
        // boosted z-index so the drawer/backdrop always sit above the map & header
        <div className={`fixed inset-0 z-[6000] ${open ? "pointer-events-auto" : "pointer-events-none"}`}>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
            />
            {/* Panel */}
            <div
                className={`absolute right-0 top-0 h-full w-full max-w-md bg-white dark:bg-slate-900 border-l dark:border-slate-700 transition-transform ${open ? "translate-x-0" : "translate-x-full"
                    }`}
            >
                <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
                    <h2 className="font-semibold">Incident Details</h2>
                    <button onClick={onClose} className="text-sm px-2 py-1 rounded border hover:bg-gray-50 dark:hover:bg-slate-800">
                        Close
                    </button>
                </div>

                {incident ? (
                    <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-56px)]">
                        {/* Header */}
                        <div className="space-y-1">
                            <div className="text-xs text-gray-500">{incident.ts}</div>
                            <div className="text-lg font-semibold">{incident.headline || (incident.type ?? "Event")}</div>
                            <div className="flex items-center gap-2">
                                <span className={`px-2 py-0.5 rounded text-xs ${SEV_BADGE[(incident.severity ?? "low").toLowerCase() as Severity]}`}>
                                    {(incident.severity ?? "unknown").toUpperCase()}
                                </span>
                                {incident.location && (
                                    <span className="text-xs text-gray-600">
                                        {(incident.location.city ?? "")}{incident.location.city ? ", " : ""}{incident.location.country ?? ""}
                                        {" · "}
                                        {incident.location.lat?.toFixed(4)}, {incident.location.lng?.toFixed(4)}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Agencies */}
                        <div>
                            <div className="text-xs font-medium mb-1">Routed to</div>
                            <div className="flex flex-wrap gap-2">
                                {routeAgencies(incident).map((a) => (
                                    <span key={a} className="px-2 py-1 rounded-full border text-xs bg-white dark:bg-slate-800">
                                        {AGENCY_LABEL[a]}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="border rounded-lg overflow-hidden dark:border-slate-700">
                            <div className="grid grid-cols-2 text-sm">
                                <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b dark:border-slate-700">Details</div>
                                <div className="px-3 py-2 bg-gray-50 dark:bg-slate-800 border-b dark:border-slate-700">Trace</div>
                            </div>
                            <div className="p-3 space-y-2 text-sm">
                                <div><span className="font-medium">Summary:</span> {incident.summary ?? "—"}</div>
                                <div className="text-xs text-gray-500">ID: {incident.id ?? "—"}</div>
                            </div>
                            <div className="p-3 border-t dark:border-slate-700 text-sm">
                                <div className="font-medium mb-1">Why routed?</div>
                                <ul className="list-disc pl-5 space-y-1">
                                    {routeTrace(incident).map((line, idx) => <li key={idx}>{line}</li>)}
                                </ul>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2">
                            <button onClick={() => onAction("ack")} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-slate-800">Acknowledge</button>
                            <button onClick={() => onAction("assign")} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-slate-800">Assign</button>
                            <button onClick={() => onAction("escalate")} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-slate-800">Escalate</button>
                            <button onClick={() => onAction("resolve")} className="px-3 py-1.5 rounded border text-sm hover:bg-gray-50 dark:hover:bg-slate-800">Resolve</button>
                        </div>
                    </div>
                ) : (
                    <div className="p-4 text-sm text-gray-500">No incident selected.</div>
                )}
            </div>
        </div>
    );
}
