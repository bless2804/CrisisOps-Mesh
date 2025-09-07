import type { Agency, Incident, Severity } from "@/types";

export function routeAgencies(i: Incident): Agency[] {
    if (i.agencyTargets) return i.agencyTargets;
    const set = new Set<Agency>();
    const type = (i.type ?? "").toLowerCase();
    const sev = (i.severity ?? "").toLowerCase() as Severity | string;
    const injured = i.injuredCount ?? 0;
    const lanes = i.lanesBlocked ?? 0;

    // Primary by type
    if (["assault", "robbery", "riot", "theft"].includes(type)) set.add("law");
    if (["fire", "vehicle_fire", "smoke", "hazmat", "collapse", "rescue"].includes(type)) set.add("fire");
    if (["accident", "crash"].includes(type)) { set.add("law"); set.add("transport"); }
    if (["flood", "earthquake", "wildfire", "storm"].includes(type)) { set.add("fire"); set.add("utilities"); set.add("law"); }

    // Attribute-based
    if (injured > 0 || i.medicalNeed || i.massCasualty) set.add("ems");
    if (i.emsInbound || injured > 0 || i.massCasualty || i.expectedSurge) set.add("hospitals");
    if (i.gasLeak || i.powerOutage || i.waterMainBreak || i.downedLines) set.add("utilities");
    if (lanes > 0 || i.roadClosed || i.transitDisruption) set.add("transport");

    // EMA/NGOs: we’re not showing EMA tab globally; but NGOs show for population-impact
    if (i.shelterNeeded || (i.displacedPeople ?? 0) > 50 || (type === "flood" && sev !== "low")) set.add("ngos");

    // Perimeter support
    if ((set.has("fire") || set.has("utilities")) && !set.has("law")) set.add("law");

    // Keep only your selected agencies
    const ALLOWED: Agency[] = ["law", "fire", "ems", "hospitals", "utilities", "transport", "ngos"];
    return Array.from(set).filter(a => ALLOWED.includes(a));
}

export function routeTrace(i: Incident): string[] {
    const out: string[] = [];
    const type = (i.type ?? "").toLowerCase();

    if (["fire", "vehicle_fire", "smoke", "hazmat", "collapse", "rescue"].includes(type)) out.push("Type indicates Fire & Rescue as primary.");
    if (["assault", "robbery", "riot", "theft"].includes(type)) out.push("Type indicates Police for scene safety.");
    if (["accident", "crash"].includes(type)) out.push("Crash: Police + Transportation for traffic control.");
    if (["flood", "earthquake", "wildfire", "storm"].includes(type)) out.push("Disaster type: add Utilities (infrastructure) & Police (perimeter).");

    if (i.injuredCount && i.injuredCount > 0) out.push("Injuries present → EMS & Hospitals.");
    if (i.emsInbound) out.push("EMS inbound notification → Hospitals.");
    if (i.lanesBlocked && i.lanesBlocked > 0) out.push("Lanes blocked → Transportation Authority.");
    if (i.gasLeak) out.push("Gas leak flag → Utilities & Fire.");
    if (i.powerOutage || i.waterMainBreak || i.downedLines) out.push("Infrastructure outage → Utilities.");
    if (i.shelterNeeded || (i.displacedPeople ?? 0) > 50) out.push("Population impact → Relief & NGOs.");
    return out.length ? out : ["Default routing policy applied."];
}
