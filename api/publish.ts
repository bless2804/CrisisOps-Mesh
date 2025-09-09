/// <reference types="node" />

// api/publish.ts

// (Optional) pin the runtime – safe to keep or remove if your project already uses Node 20
export const config = {
  runtime: "nodejs22.x",
};

let SOLACE_INITED = false;

// --- helpers ---
function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
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

export default async function handler(req: any, res: any) {
  try {
    // quick env presence check (doesn't leak secrets)
    const HAVE = {
      SOLACE_URL: !!process.env.SOLACE_URL,
      SOLACE_VPN: !!process.env.SOLACE_VPN,
      SOLACE_USER: !!process.env.SOLACE_USER,
      SOLACE_PASS: !!process.env.SOLACE_PASS,
    };
    console.log("[/api/publish] env present:", HAVE);

    const URL = mustEnv("SOLACE_URL");
    const VPN = mustEnv("SOLACE_VPN");
    const USER = mustEnv("SOLACE_USER");
    const PASS = mustEnv("SOLACE_PASS");
    const REGION = process.env.SOLACE_REGION_PATH || "ottawa";

    // dynamic imports (avoid cold-start import errors)
    const { default: WebSocket } = await import("ws");
    (globalThis as any).WebSocket = WebSocket as any;

    const raw = await import("solclientjs");
    const solace: any = (raw as any).default ?? raw;

    // one-time factory init per cold start
    if (!SOLACE_INITED) {
      const props = new solace.SolclientFactoryProperties();
      props.profile = solace.SolclientFactoryProfiles.version10;
      props.logLevel = solace.LogLevel.INFO;
      solace.SolclientFactory.init(props);
      SOLACE_INITED = true;
      console.log("[/api/publish] Solace factory initialized");
    }

    // connect
    console.log("[/api/publish] connecting…");
    const session: any = solace.SolclientFactory.createSession({
      url: URL,
      vpnName: VPN,
      userName: USER,
      password: PASS,
      connectRetries: 3,
      reconnectRetries: 3,
      generateSendTimestamps: true,
    });

    const up = new Promise<void>((resolve, reject) => {
      session.on(solace.SessionEventCode.UP_NOTICE, () => {
        console.log("[/api/publish] session UP");
        resolve();
      });
      session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e: any) => {
        console.error("[/api/publish] connect failed:", e?.infoStr || e);
        reject(new Error(e?.infoStr || "CONNECT_FAILED_ERROR"));
      });
      session.on(solace.SessionEventCode.DISCONNECTED, () => {
        console.warn("[/api/publish] DISCONNECTED");
      });
    });

    session.connect();
    await up;

    // how many to send
    const count = Math.min(
      50,
      Math.max(1, parseInt((req?.query?.count as string) || "10", 10) || 10)
    );

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
    console.log("[/api/publish] published:", published);

    try { session.disconnect(); } catch {}
    try { session.dispose(); } catch {}

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, published });
  } catch (err: any) {
    console.error("[/api/publish] ERROR:", err);
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
