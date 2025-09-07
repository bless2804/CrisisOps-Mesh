import type { Incident, Severity } from "@/types";
import { PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

const SEV_COLORS: Record<Severity, string> = {
    low: "#22c55e",
    med: "#eab308",
    high: "#f97316",
    critical: "#ef4444",
};

export default function Analytics({ events }: { events: Incident[] }) {
    const now = Date.now();
    const within = (mins: number) => events.filter(e => e.ts && (now - Date.parse(e.ts)) <= mins * 60 * 1000).length;

    const bySev = ["low", "med", "high", "critical"].map(s => ({
        name: s.toUpperCase(),
        value: events.filter(e => (e.severity ?? "").toLowerCase() === s).length,
        key: s,
    })) as { name: string; value: number; key: Severity | string }[];

    // last 30 minutes, per minute buckets
    const buckets: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
        const t = new Date(now - i * 60 * 1000);
        const label = t.getHours().toString().padStart(2, "0") + ":" + t.getMinutes().toString().padStart(2, "0");
        buckets[label] = 0;
    }
    events.forEach(e => {
        if (!e.ts) return;
        const d = new Date(e.ts);
        const label = d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
        if (label in buckets) buckets[label] += 1;
    });
    const timeSeries = Object.entries(buckets).map(([time, count]) => ({ time, count }));

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* KPIs */}
            <div className="border rounded-lg p-4 dark:border-slate-700">
                <div className="text-xs text-gray-500">Incidents (5 min)</div>
                <div className="text-2xl font-bold">{within(5)}</div>
            </div>
            <div className="border rounded-lg p-4 dark:border-slate-700">
                <div className="text-xs text-gray-500">Incidents (15 min)</div>
                <div className="text-2xl font-bold">{within(15)}</div>
            </div>
            <div className="border rounded-lg p-4 dark:border-slate-700">
                <div className="text-xs text-gray-500">Incidents (60 min)</div>
                <div className="text-2xl font-bold">{within(60)}</div>
            </div>

            {/* Distribution by severity */}
            <div className="md:col-span-1 border rounded-lg p-4 dark:border-slate-700">
                <div className="text-sm font-medium mb-2">By Severity</div>
                <div className="h-48">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={bySev} dataKey="value" nameKey="name" innerRadius={35} outerRadius={60}>
                                {bySev.map((entry) => (
                                    <Cell key={entry.key} fill={SEV_COLORS[(entry.key as Severity)] ?? "#94a3b8"} />
                                ))}
                            </Pie>
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Events per minute (last 30) */}
            <div className="md:col-span-2 border rounded-lg p-4 dark:border-slate-700">
                <div className="text-sm font-medium mb-2">Events per minute (30m)</div>
                <div className="h-48">
                    <ResponsiveContainer>
                        <LineChart data={timeSeries}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                            <YAxis allowDecimals={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="count" stroke="#0ea5e9" strokeWidth={2} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
}
