import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { Incident } from "@/types";

// simple color map by severity
const sevColor: Record<string, string> = {
    low: "#22c55e",      // green
    med: "#eab308",      // amber
    high: "#f97316",     // orange
    critical: "#ef4444", // red
};

export default function MapView({ events }: { events: Incident[] }) {
    // get all positions from events that have a location
    const positions = events
        .map((e) => e.location && [e.location.lat, e.location.lng] as [number, number])
        .filter(Boolean) as [number, number][];

    // center on first event or default to Ottawa for now
    const center: [number, number] = positions[0] ?? [45.4215, -75.6972];

    return (
        <div className="h-[480px] rounded-xl overflow-hidden border">
            <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full">
                <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />

                {events.map((e, i) =>
                    e.location ? (
                        <CircleMarker
                            key={(e.id ?? i) + String(e.ts)}
                            center={[e.location.lat, e.location.lng]}
                            radius={10}
                            pathOptions={{
                                color: sevColor[(e.severity ?? "").toLowerCase()] ?? "#64748b",
                                weight: 2,
                                fillOpacity: 0.8,
                            }}
                        >
                            <Popup>
                                <div style={{ fontWeight: 600 }}>
                                    {(e.type ?? "event").toUpperCase()} · {e.severity ?? "unknown"}
                                </div>
                                <div>{e.headline || e.summary || "—"}</div>
                                <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                                    {(e.location.city ?? "") + (e.location.city ? ", " : "") + (e.location.country ?? "")}
                                    <br />
                                    {e.ts ?? ""}
                                </div>
                            </Popup>
                        </CircleMarker>
                    ) : null
                )}
            </MapContainer>
        </div>
    );
}
