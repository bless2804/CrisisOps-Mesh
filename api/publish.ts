/// <reference types="node" />

// Polyfill WebSocket for Node (solclientjs expects a browser-like WebSocket)
import { WebSocket as NodeWebSocket } from "ws";
(globalThis as any).WebSocket = NodeWebSocket as any;

// solclientjs can export either `solace` or the namespace. Normalize it:
import solMod from "solclientjs";
const solace: any = (solMod as any).solace || solMod;

// Init the factory (plain object; don't new() a Properties class in Node)
solace.SolclientFactory.init({
  profile: solace.SolclientFactoryProfiles.version10,
  logLevel: solace.LogLevel.WARN,
} as any);

// -------------------- env --------------------
const URL = process.env.SOLACE_URL;
const VPN = process.env.SOLACE_VPN;
const USER = process.env.SOLACE_USER;
const PASS = process.env.SOLACE_PASS;
const REGION = process.env.SOLACE_REGION_PATH || "ottawa";

function assertEnv() {
  const miss = ["SOLACE_URL", "SOLACE_VPN", "SOLACE_USER", "SOLACE_PASS"]
    .filter((k) => !process.env[k]);
  if (miss.length) throw new Error(`Missing env vars: ${miss.join(", ")}`);
}

// -------------------- helper --------------------
function randomIncident() {
  const types = ["flood","accident","assault","disease","earthquake","fire"] as const;
  const sevs  = ["low","med","high","critical"] as const;
  const type = types[Math.floor(Math.random() * types.length)];
  const sev  = sevs[Math.floor(Math.random() * sevs.length)];
  const lat = 45.3215 + (Math.random() - 0.5) * 0.35;
  const lng = -75.8572 + (Math.random() - 0.5) * 0.55;
  const lanes = Math.random() < 0.4 ? Math.floor(Math.random() * 3) : 0;

  return {
    id: "vc_" + Math.random().toString(16).slice(2, 8),
    ts: new Date().toISOString(),
    type,
    severity: sev,
    source: "sensor",
    headline: `${type[0].toUpperCase()}${type.slice(1)} reported`,
    summary: "Mock event from Vercel cron publisher",
    location: { lat, lng, city: "Ottawa", country: "CA" },
    jurisdiction: "Ottawa, ON",
    injuredCount: Math.random() < 0.35 ? Math.floor(Math.random() * 3) : 0,
    lanesBlocked: lanes,
    roadClosed: lanes >= 2,
    powerOutage: type === "flood" && Math.random() < 0.3,
    shelterNeeded: type === "flood" && sev !== "low" && Math.random() < 0.4,
    displacedPeople: type === "flood" ? Math.floor(Math.random() * 200) : 0,
  };
}

function connect(): Promise<any> {
  return new Promise((resolve, reject) => {
    const sessionProps = new solace.SessionProperties({
      url: URL!,
      vpnName: VPN!,
      userName: USER!,
      password: PASS!,
      connectRetries: 3,
      reconnectRetries: 5,
      generateSendTimestamps: true,
    });
    const session = solace.SolclientFactory.createSession(sessionProps);

    session.on(solace.SessionEventCode.UP_NOTICE, () => resolve(session));
    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e: any) => reject(e));
    session.on(solace.SessionEventCode.DISCONNECTED, () => {
      try { session.dispose(); } catch {}
    });
    session.connect();
  });
}

// -------------------- handler --------------------
export default async function handler(req: any, res: any) {
  try {
    assertEnv();

    const count = Math.min(50,
      Math.max(1, parseInt((req?.query?.count as string) || "10", 10) || 10)
    );

    const session = await connect();
    const createTopic = solace.SolclientFactory.createTopicDestination;
    const createMsg   = solace.SolclientFactory.createMessage;

    let published = 0;
    for (let i = 0; i < count; i++) {
      const inc  = randomIncident();
      const topic = `crisis/events/${inc.source}/${REGION}/${inc.type}/${inc.severity}`;
      const msg = createMsg();
      msg.setDestination(createTopic(topic));
      msg.setBinaryAttachment(JSON.stringify(inc));
      msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
      session.send(msg);
      published++;
    }

    try { session.disconnect(); } catch {}
    try { session.dispose(); } catch {}

    res.status(200).json({ ok: true, published });
  } catch (e: any) {
    console.error("[publish] error", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
