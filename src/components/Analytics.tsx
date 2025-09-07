import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident, Severity } from "@/types";

const order: Severity[] = ["low", "med", "high", "critical"];
const label: Record<Severity, string> = {
  low: "Low",
  med: "Medium",
  high: "High",
  critical: "Critical",
};
const color: Record<Severity, string> = {
  low: "#22c55e",
  med: "#eab308",
  high: "#f97316",
  critical: "#ef4444",
};

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  const a = (angle - 90) * (Math.PI / 180);
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}
function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const sweep = 0;
  const largeArc = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} ${sweep} ${end.x} ${end.y} L ${cx} ${cy} Z`;
}

export default function Analytics({ events }: { events: Incident[] }) {
  // Counts by severity (auto-updates with filters because 'events' is pre-filtered upstream)
  const counts = useMemo(() => {
    const c = { low: 0, med: 0, high: 0, critical: 0 } as Record<Severity, number>;
    for (const e of events) {
      const sev = (e.severity ?? "low").toLowerCase() as Severity;
      if (c[sev] != null) c[sev] += 1;
    }
    return c;
  }, [events]);
  const total = order.reduce((s, k) => s + counts[k], 0) || 1;

  // Interactive focus
  const [active, setActive] = useState<Severity | null>(null);
  const pieRef = useRef<HTMLDivElement | null>(null);

  // Unfocus when clicking *anywhere* inside the card that is not a slice, or anywhere outside
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!pieRef.current) return;
      if (!pieRef.current.contains(e.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onDocClick);
    return () => document.removeEventListener("pointerdown", onDocClick);
  }, []);

  // Build pie slices (protect against "full circle" disappearing by clamping to <360°)
  let angle = 0;
  const slices = order.map((sev) => {
    const pct = counts[sev] / total;
    const start = angle * 360;
    const rawEnd = (angle + pct) * 360;
    const end = Math.min(rawEnd, start + 359.999); // clamp full circle
    angle += pct;
    const mid = (start + end) / 2;
    return { sev, start, end, pct, mid };
  });

  // Bigger, nicer activity chart with grids/axes
  const activity = useMemo(() => {
    const now = Date.now();
    const buckets: number[] = Array.from({ length: 10 }, () => 0);
    for (const e of events) {
      if (!e.ts) continue;
      const mins = Math.floor((now - new Date(e.ts).getTime()) / 60000);
      if (mins >= 0 && mins < 10) buckets[9 - mins]++; // newest at right
    }
    const max = Math.max(1, ...buckets);

    const W = 760, H = 260, P = 42; // width, height, padding
    const innerW = W - P * 2;
    const innerH = H - P * 2;
    const stepX = innerW / (buckets.length - 1);

    const points = buckets.map((v, i) => {
      const x = P + i * stepX;
      const y = P + innerH - (v / max) * innerH;
      return [x, y] as const;
    });

    const path = points.map((p, i) => (i ? "L" : "M") + p[0] + " " + p[1]).join(" ");
    const area =
      `M ${P} ${P + innerH} ` +
      points.map((p) => `L ${p[0]} ${p[1]}`).join(" ") +
      ` L ${P + innerW} ${P + innerH} Z`;

    // Gridlines (5 rows)
    const rows = 5;
    const gridY = Array.from({ length: rows + 1 }, (_, i) => P + (innerH / rows) * i);
    const yTicks = gridY.map((y, i) => ({
      y,
      value: Math.round(max - (max / rows) * i),
    }));

    return { W, H, P, innerW, innerH, buckets, points, path, area, yTicks, stepX };
  }, [events]);

  // Click background inside the severity card to unfocus
  const unfocusInsideCard = () => setActive(null);

  return (
    // 1/3 : 2/3 layout (pie narrower, activity wider)
    <div className="grid gap-4 md:grid-cols-3">
      {/* Severity (interactive donut) */}
      <div
        className="border rounded-lg p-4 flex items-center justify-center md:col-span-1"
        ref={pieRef}
        onClick={unfocusInsideCard}
      >
        <div className="w-full">
          <div className="text-base font-semibold mb-3">Severity</div>
          <div className="flex items-center justify-center">
            <svg width="240" height="240">
              <defs>
                <filter id="softShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.15" />
                </filter>
              </defs>
              <g transform="translate(20,20)" filter="url(#softShadow)">
                {slices.map(({ sev, start, end, pct, mid }) => {
                  const isActive = active === sev;
                  const r = isActive ? 96 : 92;
                  const d = arcPath(100, 100, r, start, end);
                  const handleSliceClick = (ev: React.MouseEvent) => {
                    ev.stopPropagation(); // don't trigger background unfocus
                    setActive((prev) => (prev === sev ? null : sev));
                  };
                  return (
                    <path
                      key={sev}
                      d={d}
                      fill={color[sev]}
                      opacity={pct === 0 ? 0.1 : isActive ? 0.95 : 0.85}
                      stroke="#fff"
                      strokeWidth={1.5}
                      style={{ cursor: "pointer", transition: "all .2s" }}
                      onClick={handleSliceClick}
                      aria-label={`${label[sev]}: ${counts[sev]}`}
                    />
                  );
                })}
                {/* inner hole & total */}
                <circle cx="100" cy="100" r="58" fill="#ffffff" />
                <text x="100" y="98" textAnchor="middle" fontSize="20" fontWeight={700}>
                  {order.reduce((s, k) => s + counts[k], 0)}
                </text>
                <text x="100" y="118" textAnchor="middle" fontSize="12" fill="#6b7280">
                  total
                </text>

                {/* Floating chip when active (wider & better clamped) */}
                {active && (() => {
                  const s = slices.find((x) => x.sev === active)!;
                  const mid = s.mid;
                  const pt = polarToCartesian(100, 100, 118, mid); // a bit further out
                  const txt = `${label[active]} — ${counts[active]}`;
                  const w = Math.max(100, 24 + txt.length * 9); // wider chip
                  const h = 28;
                  // Inner drawing area is 200x200 (because of translate(20,20))
                  const x = Math.min(Math.max(pt.x - w / 2, 0), 200 - w);
                  const y = Math.min(Math.max(pt.y - h / 2, 0), 200 - h);
                  return (
                    <g transform={`translate(${x},${y})`}>
                      <rect width={w} height={h} rx={8} ry={8} fill="#ffffff" stroke="#cbd5e1" />
                      <circle cx={12} cy={h / 2} r={5.5} fill={color[active]} />
                      <text x={24} y={h / 2 + 4} fontSize="12" fontWeight={700}>
                        {txt}
                      </text>
                    </g>
                  );
                })()}
              </g>
            </svg>
          </div>
        </div>
      </div>

      {/* Activity (bigger, with axes & grids) */}
      <div className="border rounded-lg p-4 md:col-span-2">
        <div className="text-base font-semibold mb-3">Activity (last 10 minutes)</div>
        <svg width={activity.W} height={activity.H} className="block">
          {/* Gridlines */}
          {activity.yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={activity.P}
                x2={activity.P + activity.innerW}
                y1={t.y}
                y2={t.y}
                stroke={i === activity.yTicks.length - 1 ? "#94a3b8" : "#e2e8f0"}
                strokeDasharray={i === activity.yTicks.length - 1 ? "0" : "4 4"}
              />
              <text x={activity.P - 8} y={t.y + 4} fontSize="10" textAnchor="end" fill="#64748b">
                {t.value}
              </text>
            </g>
          ))}

          {/* Axes */}
          <line
            x1={activity.P}
            x2={activity.P + activity.innerW}
            y1={activity.P + activity.innerH}
            y2={activity.P + activity.innerH}
            stroke="#94a3b8"
          />
          <line
            x1={activity.P}
            x2={activity.P}
            y1={activity.P}
            y2={activity.P + activity.innerH}
            stroke="#94a3b8"
          />

          {/* X labels (-9m ... now) */}
          {Array.from({ length: 10 }, (_, i) => i).map((i) => {
            const x = activity.P + i * activity.stepX;
            const l = i === 9 ? "now" : `-${9 - i}m`;
            return (
              <text key={i} x={x} y={activity.P + activity.innerH + 16} fontSize="10" textAnchor="middle" fill="#64748b">
                {l}
              </text>
            );
          })}

          {/* Area + line + points */}
          <defs>
            <linearGradient id="areaBlue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.06" />
            </linearGradient>
          </defs>
          <path d={activity.area} fill="url(#areaBlue)" />
          <path d={activity.path} fill="none" stroke="#3b82f6" strokeWidth="3" />
          {activity.points.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="3.5" fill="#2563eb" />
          ))}
        </svg>
      </div>
    </div>
  );
}
