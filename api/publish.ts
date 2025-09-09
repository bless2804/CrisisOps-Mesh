/// <reference types="node" />

// Node polyfill for WebSocket (required by solclientjs in serverless env)
import WebSocket from "ws";
(globalThis as any).WebSocket = WebSocket as any;

type SolaceAny = any;

function assertEnv() {
  const req = ["SOLACE_URL", "SOLACE_VPN", "SOLACE_USER", "SOLACE_PASS"];
  const missing = req.filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing env vars: ${missing.join(", ")}`);
}

// Load solclientjs in a way that works with CommonJS/ESM on Vercel
async function loadSolace(): Promise<SolaceAny> {
  const mod: any = await import("solclientjs");
  return (mod?.default ?? mod) as SolaceAny;
}

async function connect(solace: SolaceAny) {
  // IMPORTANT: init with a plain object (not new SolclientFactoryProperties())
  solace.SolclientFactory.init({
    profile: solace.SolclientFactoryProfiles.version10,
    logLevel: solace.LogLevel.WARN,
  } as any);

  return await new Promise<SolaceAny>((resolve, reject) => {
    const session = solace.SolclientFactory.createSession({
      url: process.env.SOLACE_URL!,
      vpnName: process.env.SOLACE_VPN!,
      userName: process.env.SOLACE_USER!,
      password: process.env.SOLACE_PASS!,
      connectRetries: 3,
      reconnectRetries: 5,
      generateSendTimestamps: true,
    });

    session.on(solace.SessionEventCode.UP_NOTICE, () => resolve(session));
    session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e: any) =>
      reject(new Error(e?.infoStr || "CONNECT_FAILED_ERROR"))
    );
    session.on(solace.SessionEventCode.DISCONNECTED, () =>
      console.warn("[publish] DISCONNECTED")
    );

    session.connect();
  });
}

function randomIncident() {
  const types = ["flood", "accident", "assault", "disease", "earthquake", "fire"] as const;
  const sevs = ["low", "med", "high", "critical"] as const;
  const typ = types[Math.floor(Math.random() * types.length)];
  const sev = sevs[Math.floor(Math.random() * sevs.length)];
  const lat = 45.3215 + (Math.random() - 0.5) * 0.35;
  const lng = -75.8572 + (Math.random() - 0.5) * 0.55;

  return {
    id: "vc_" + Math.random().toString(16).slice(2, 8),
    ts: new Date().toISOString(),
    type: typ,
    severity: sev,
    source: "sensor",
    headline: `${typ[0].toUpperCase() + typ.slice(1)} reported`,
    summary: "Mock event from Vercel publisher",
    location: { lat, lng, city: "Ottawa", country: "CA" },
    jurisdiction: "Ottawa, ON",
  };
}

export default async function handler(req: any, res: any) {
  try {
    assertEnv();

    const solace = await loadSolace();

    const count = Math.min(
      50,
      Math.max(1, parseInt((req?.query?.count as string) || "10", 10) || 10)
    );
    const region = process.env.SOLACE_REGION_PATH || "ottawa";

    const session = await connect(solace);

    const createTopic = solace.SolclientFactory.createTopicDestination;
    const createMsg = solace.SolclientFactory.createMessage;

    let published = 0;
    for (let i = 0; i < count; i++) {
      const inc = randomIncident();
      const topic = `crisis/events/${inc.source}/${region}/${inc.type}/${inc.severity}`;
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
    console.error("[publish] error", e);
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
