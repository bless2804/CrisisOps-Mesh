import { MapContainer, TileLayer, Circle, Popup } from "react-leaflet";
import type { Incident } from "@/types";
import type { LatLngExpression } from "leaflet";

const sevColor: Record<string, string> = {
    low: "#22c55e",
    med: "#eab308",
    high: "#f97316",
    critical: "#ef4444",
};

export default function MapView({ events }: { events: Incident[] }) {
    const positions = events
        .map((e) => (e.location ? [e.location.lat, e.location.lng] as [number, number] : null))
        .filter(Boolean) as [number, number][];

    const center: LatLngExpression = (positions[0] ?? [45.4215, -75.6972]) as LatLngExpression;

    return (
        <div className="h-[480px] rounded-xl overflow-hidden border">
            <MapContainer center={center} zoom={12} scrollWheelZoom={true} className="h-full w-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {events.map((e, i) =>
                    e.location ? (
                        <Circle
                            key={(e.id ?? i) + String(e.ts)}
                            center={[e.location.lat, e.location.lng] as LatLngExpression}
                            radius={120} // meters; adjust for your city scale
                            pathOptions={{
                                color: sevColor[(e.severity ?? "").toLowerCase()] ?? "#64748b",
                                weight: 2,
                                fillOpacity: 0.5,
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
                        </Circle>
                    ) : null
                )}
            </MapContainer>
        </div>
    );
}
