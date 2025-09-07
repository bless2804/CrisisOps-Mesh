import type { Incident } from "@/types";

export default function IncidentDrawer({
  open,
  incident,
  onClose,
}: {
  open: boolean;
  incident?: Incident;
  onClose: () => void;
}) {
  if (!open || !incident) return null;
  const sev = (incident.severity ?? "low").toUpperCase();
  const loc = incident.location;

  return (
    <div className="fixed inset-0 z-[4000] bg-black/20">
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white border-l p-4 overflow-y-auto">
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">Incident Details</div>
          <button onClick={onClose} className="px-2 py-1 border rounded text-sm">Close</button>
        </div>

        <div className="text-xs text-gray-500 mt-2">{incident.ts ?? ""}</div>

        <h2 className="text-xl font-bold mt-2">{incident.headline ?? incident.type ?? "Incident"}</h2>

        <div className="mt-1 inline-flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded border">{sev}</span>
          {loc && (
            <span className="text-xs text-gray-600">
              {(loc.city ?? "") + (loc.city ? ", " : "") + (loc.country ?? "")}
              {" · "}
              {loc.lat?.toFixed(4)}, {loc.lng?.toFixed(4)}
            </span>
          )}
        </div>

        {incident.agencyTargets && incident.agencyTargets.length > 0 && (
          <div className="mt-3">
            <div className="text-xs font-medium text-gray-600 mb-1">Routed to</div>
            <div className="flex flex-wrap gap-2">
              {incident.agencyTargets.map((a) => (
                <span key={a} className="text-xs px-2 py-0.5 rounded-full border bg-white">
                  {a[0].toUpperCase() + a.slice(1)}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 border rounded">
          <div className="px-3 py-2 border-b font-medium">Details</div>
          <div className="p-3 text-sm">
            <div><span className="font-semibold">Summary:</span> {incident.summary ?? "—"}</div>
            {incident.id && <div className="text-xs text-gray-500 mt-1">ID: {incident.id}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
