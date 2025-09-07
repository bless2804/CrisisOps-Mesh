export type Agency =
    | "law"          // Police
    | "fire"         // Fire & Rescue
    | "ems"          // EMS (Ambulance)
    | "hospitals"    // Hospitals / ED
    | "utilities"    // Public Works / Utilities
    | "transport"    // Transportation Authority
    | "ngos";        // Relief & NGOs

export type Severity = "low" | "med" | "high" | "critical";

export type Incident = {
    id?: string;
    ts?: string; // ISO string
    type?: string;
    severity?: Severity | string;
    headline?: string;
    summary?: string;
    location?: { lat: number; lng: number; city?: string; country?: string };

    // Optional fields your backend can include (used for “relevance” rules & trace)
    injuredCount?: number;
    lanesBlocked?: number;
    roadClosed?: boolean;
    gasLeak?: boolean;
    powerOutage?: boolean;
    waterMainBreak?: boolean;
    downedLines?: boolean;
    transitDisruption?: boolean;
    medicalNeed?: boolean;
    emsInbound?: boolean;
    massCasualty?: boolean;
    expectedSurge?: boolean;
    multiJurisdiction?: boolean;
    shelterNeeded?: boolean;
    displacedPeople?: number;
    areaKm2?: number;
    affectedPopulation?: number;

    // Routing target override (optional)
    agencyTargets?: Agency[];

    // Lifecycle (optional, used by buttons)
    acknowledged?: boolean;
    assignedTo?: string;
    escalated?: boolean;
    resolved?: boolean;
};

export type CommandType = "ack" | "assign" | "escalate" | "resolve";

export type Command = {
    type: CommandType;
    incidentId: string;
    user?: string;
    note?: string;
    at: string; // ISO timestamp
};
