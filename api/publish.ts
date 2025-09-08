/// <reference types="node" />

// api/publish.ts
import * as solace from 'solclientjs';

// Init once per cold start
const f = new solace.SolclientFactoryProperties();
f.profile = solace.SolclientFactoryProfiles.version10;
f.logLevel = solace.LogLevel.WARN;
solace.SolclientFactory.init(f);

// --- server-side env (do NOT prefix with VITE_) ---
const URL  = process.env.SOLACE_URL!;
const VPN  = process.env.SOLACE_VPN!;
const USER = process.env.SOLACE_USER!;
const PASS = process.env.SOLACE_PASS!;
const REGION = process.env.SOLACE_REGION_PATH || 'ottawa';

function randomIncident() {
  const types = ["flood","accident","assault","disease","earthquake","fire"];
  const sevs  = ["low","med","high","critical"];
  const typ = types[Math.floor(Math.random()*types.length)];
  const sev = sevs[Math.floor(Math.random()*sevs.length)];
  const lat = 45.3215 + (Math.random()-0.5)*0.35;
  const lng = -75.8572 + (Math.random()-0.5)*0.55;
  const lanes = Math.random()<0.4 ? Math.floor(Math.random()*3) : 0;
  return {
    id: "vc_" + Math.random().toString(16).slice(2,8),
    ts: new Date().toISOString(),
    type: typ, severity: sev, source: "sensor",
    headline: `${typ[0].toUpperCase()+typ.slice(1)} reported`,
    summary: "Mock event from Vercel cron publisher",
    location: { lat, lng, city: "Ottawa", country: "CA" },
    jurisdiction: "Ottawa, ON",
    injuredCount: Math.random()<0.35 ? Math.floor(Math.random()*3) : 0,
    lanesBlocked: lanes, roadClosed: lanes >= 2,
    powerOutage: typ==="flood" && Math.random()<0.3,
    shelterNeeded: typ==="flood" && sev!=="low" && Math.random()<0.4,
    displacedPeople: typ==="flood" ? Math.floor(Math.random()*200) : 0
  };
}

function connect(): Promise<solace.Session> {
  return new Promise((resolve, reject) => {
    const s = solace.SolclientFactory.createSession({
      url: URL, vpnName: VPN, userName: USER, password: PASS,
    });
    s.on(solace.SessionEventCode.UP_NOTICE, () => resolve(s));
    s.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, e => reject(e));
    s.on(solace.SessionEventCode.DISCONNECTED, () => {});
    s.connect();
  });
}

// No @vercel/node types here -> no dependency needed
export default async function handler(_req: any, res: any) {
  try {
    const session = await connect();
    const createTopic = solace.SolclientFactory.createTopicDestination;
    const createMsg   = solace.SolclientFactory.createMessage;

    let published = 0;
    for (let i = 0; i < 10; i++) {
      const inc = randomIncident();
      const topic = `crisis/events/${inc.source}/${REGION}/${inc.type}/${inc.severity}`;
      const msg = createMsg();
      msg.setDestination(createTopic(topic));
      msg.setBinaryAttachment(JSON.stringify(inc));
      msg.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
      session.send(msg);
      published++;
    }
    session.dispose();
    res.status(200).json({ ok: true, published });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
