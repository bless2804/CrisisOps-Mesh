import { MapContainer, TileLayer, Circle, Popup, useMap } from "react-leaflet";
import type { Incident } from "@/types";
import type { LatLngExpression, LatLngBoundsLiteral } from "leaflet";

const sevColor: Record<string, string> = {
    low: "#22c55e",
    med: "#eab308",
    high: "#f97316",
    critical: "#ef4444",
};

function FlyToSelected({ incident }: { incident?: Incident }) {
    const map = useMap();
    if (!incident?.location) return null;
    const { lat, lng } = incident.location;
    map.flyTo([lat, lng] as LatLngExpression, 14, { duration: 0.6 });
    return null;
}

function FitToVisible({ events, selectedId }: { events: Incident[]; selectedId?: string }) {
    const map = useMap();
    const pts = events.filter(e => e.location).map(e => [e.location!.lat, e.location!.lng]) as [number, number][];
    if (selectedId || pts.length === 0) return null;
    if (pts.length === 1) {
        map.flyTo(pts[0] as LatLngExpression, 12, { duration: 0.4 });
    } else {
        const bounds: LatLngBoundsLiteral = [pts.reduce((a, b) => a[0] < b[0] ? a : b), pts.reduce((a, b) => a[0] > b[0] ? a : b)];
        map.fitBounds(bounds, { padding: [40, 40] });
    }
    return null;
}

export default function MapView({
    events,
    selectedId,
    onSelect,
    recentIds = [],
}: {
    events: Incident[];
    selectedId?: string;
    onSelect?: (id: string) => void;
    recentIds?: string[];
}) {
    const positions = events
        .map((e) => (e.location ? [e.location.lat, e.location.lng] as [number, number] : null))
        .filter(Boolean) as [number, number][];
    const center: LatLngExpression = (positions[0] ?? [45.4215, -75.6972]) as LatLngExpression;
    const selected = events.find((e) => e.id && e.id === selectedId);

    return (
        <div className="h-[420px] rounded-xl overflow-hidden border dark:border-slate-700 relative z-0">
            <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full">
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                {selected && <FlyToSelected incident={selected} />}
                <FitToVisible events={events} selectedId={selectedId} />

                {events.map((e, i) =>
                    e.location ? (
                        <Circle
                            key={(e.id ?? i) + String(e.ts)}
                            center={[e.location.lat, e.location.lng] as LatLngExpression}
                            radius={
                                selectedId && e.id === selectedId
                                    ? 180
                                    : recentIds.includes(String(e.id)) ? 200 : 120
                            }
                            pathOptions={{
                                color: sevColor[(e.severity ?? "").toLowerCase()] ?? "#64748b",
                                weight: e.id === selectedId ? 3 : 2,
                                fillOpacity: e.id === selectedId ? 0.6 : 0.5,
                            }}
                            eventHandlers={{ click: () => e.id && onSelect?.(e.id) }}
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
