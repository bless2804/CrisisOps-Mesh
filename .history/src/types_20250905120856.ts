export type Incident = {
    id?: string;
    ts?: string;
    type?: string;
    severity?: "low" | "med" | "high" | "critical" | string;
    headline?: string;
    summary?: string;
    location?: { lat: number; lng: number; city?: string; country?: string };
};
