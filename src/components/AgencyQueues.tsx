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

export default function AgencyQueues({
  events,
  agencies,
  onSelect,
}: {
  events: Incident[];
  agencies: Agency[];
  onSelect?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {agencies.map((a) => {
        const list = events.filter((e) => routeAgencies(e).includes(a));
        return (
          <div key={a} className="border rounded-lg p-3 h-56 flex flex-col">
            <div className="font-medium mb-2">{AGENCY_LABEL[a]}</div>
            {/* Scrollable incidents list with fixed card height */}
            <ul className="space-y-2 overflow-y-auto pr-1">
              {list.map((e, i) => {
                const sev = (e.severity ?? "low").toLowerCase() as Severity;
                const id = e.id ?? String(i);
                return (
                  <li
                    key={id + String(e.ts)}
                    className="text-sm flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5"
                    onClick={() => onSelect?.(id)}
                    title="Open incident"
                  >
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
