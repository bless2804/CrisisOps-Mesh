/// <reference types="node" />

// --- Polyfill WebSocket for Node (Vercel functions run in Node) ---
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket as any;

// Helper to load solclientjs correctly in Node (CJS/UMD)
async function loadSolace(): Promise<any> {
  const mod: any = await import("solclientjs");
  // If it's a CJS/UMD bundle, the usable object is usually on `default`
  return mod?.default ?? mod;
}

// ---- Server-side env (NO VITE_ prefix here) ----
const URL = process.env.SOLACE_URL;
const VPN = process.env.SOLACE_VPN;
const USER = process.env.SOLACE_USER;
const PASS = process.env.SOLACE_PASS;
const REGION = process.env.SOLACE_REGION_PATH || "ottawa";

function assertEnv() {
  const missing = ["SOLACE_URL", "SOLACE_VPN", "SOLACE_USER", "SOLACE_PASS"].filter(
    (k) => !process.env[k]
  );
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

function randomIncident() {
  const types = ["flood", "accident", "assault", "disease", "earthquake", "fire"] as const;
  const sevs = ["low", "med", "high", "critical"] as const;
  const typ = types[Math.floor(Math.random() * types.length)];
  const sev = sevs[Math.floor(Math.random() * sevs.length)];
  const lat = 45.3215 + (Math.random() - 0.5) * 0.35;
  const lng = -75.8572 + (Math.random() - 0.5) * 0.55;
  const lanes = Math.random() < 0.4 ? Math.floor(Math.random() * 3) : 0;

  return {
    id: "vc_" + Math.random().toString(16).slice(2, 8),
    ts: new Date().toISOString(),
    type: typ,
    severity: sev,
    source: "sensor",
    headline: `${typ[0].toUpperCase() + typ.slice(1)} reported`,
    summary: "Mock event from Vercel cron publisher",
    location: { lat, lng, city: "Ottawa", country: "CA" },
    jurisdiction: "Ottawa, ON",
    injuredCount: Math.random() < 0.35 ? Math.floor(Math.random() * 3) : 0,
    lanesBlocked: lanes,
    roadClosed: lanes >= 2,
    powerOutage: typ === "flood" && Math.random() < 0.3,
    shelterNeeded: typ === "flood" && sev !== "low" && Math.random() < 0.4,
    displacedPeople: typ === "flood" ? Math.floor(Math.random() * 200) : 0,
  };
}

async function connect(solace: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const session = solace.SolclientFactory.createSession({
      url: URL!,
      vpnName: VPN!,
      userName: USER!,
      password: PASS!,
      connectRetries: 3,
      reconnectRetries: 5,
      generateSendTimestamps: true,
    });

    session.on(solace.SessionEventCode.UP_NOTICE, () => resolve(session));
    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e: any) => reject(e));
    session.on(solace.SessionEventCode.DISCONNECTED, () => {
      // optional: log
    });

    session.connect();
  });
}

export default async function handler(req: any, res: any) {
  try {
    assertEnv();

    const count = Math.min(
      50,
      Math.max(1, parseInt((req?.query?.count as string) || "10", 10) || 10)
    );

    // Load solclientjs the Node-safe way
    const solace = await loadSolace();

    // One-time init on cold start
    const factoryProps = new solace.SolclientFactoryProperties();
    factoryProps.profile = solace.SolclientFactoryProfiles.version10;
    factoryProps.logLevel = solace.LogLevel.WARN;
    solace.SolclientFactory.init(factoryProps);

    const session = await connect(solace);

    const createTopic = solace.SolclientFactory.createTopicDestination;
    const createMsg = solace.SolclientFactory.createMessage;

    let published = 0;
    for (let i = 0; i < count; i++) {
      const inc = randomIncident();
      const topic = `crisis/events/${inc.source}/${REGION}/${inc.type}/${inc.severity}`;
      const msg = createMsg();
      msg.setDestination(createTopic(topic));
      msg.setBinaryAttachment(JSON.stringify(inc));
      msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
      session.send(msg);
      published++;
    }

    try {
      session.disconnect();
      session.dispose?.();
    } catch {}

    res.status(200).json({ ok: true, published });
  } catch (e: any) {
    console.error("[/api/publish] error", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
