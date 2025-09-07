/* eslint-disable @typescript-eslint/no-explicit-any */
export type SolaceSession = any;

export async function connectSolace(opts: {
    url: string; vpnName: string; userName: string; password: string;
}): Promise<SolaceSession> {
    const solace = (await import('solclientjs')).default;

    const fp = new solace.SolclientFactoryProperties();
    fp.profile = solace.SolclientFactoryProfiles.version10;
    fp.logLevel = solace.LogLevel.WARN;
    solace.SolclientFactory.init(fp);

    const sp = new solace.SessionProperties();
    sp.url = opts.url;
    sp.vpnName = opts.vpnName;
    sp.userName = opts.userName;
    sp.password = opts.password;
    sp.connectRetries = 3;

    const session = solace.SolclientFactory.createSession(sp);

    await new Promise<void>((resolve, reject) => {
        session.on(solace.SessionEventCode.UP_NOTICE, () => resolve());
        session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e: unknown) => reject(e));
        session.on(solace.SessionEventCode.DISCONNECTED, () => console.warn("Solace disconnected"));
        session.connect();
    });

    return session;
}

export async function subscribe(session: SolaceSession, topic: string, onEvent: (obj: unknown) => void) {
    const solace = (await import('solclientjs')).default;

    session.on(solace.SessionEventCode.MESSAGE, (msg: any) => {
        const payload = msg.getBinaryAttachment?.();
        if (!payload) return;
        try { onEvent(JSON.parse(payload)); } catch { /* ignore non-JSON */ }
    });

    session.subscribe(
        solace.SolclientFactory.createTopicDestination(topic),
        true,
        topic,
        1000
    );
}

export async function publish(session: SolaceSession, topic: string, body: unknown) {
    const solace = (await import('solclientjs')).default;
    const message = solace.SolclientFactory.createMessage();
    message.setDestination(solace.SolclientFactory.createTopicDestination(topic));
    message.setDeliveryMode(solace.MessageDeliveryModeType.DIRECT);
    message.setBinaryAttachment(JSON.stringify(body));
    session.send(message);
}

// Convenience helpers for commands (topics are examples; align with backend)
export async function publishAck(session: SolaceSession, incidentId: string, user = "ui") {
    await publish(session, `crisis/cmd/ack/${incidentId}`, { type: "ack", incidentId, user, at: new Date().toISOString() });
}
export async function publishAssign(session: SolaceSession, incidentId: string, user = "ui") {
    await publish(session, `crisis/cmd/assign/${incidentId}`, { type: "assign", incidentId, user, at: new Date().toISOString() });
}
export async function publishEscalate(session: SolaceSession, incidentId: string, user = "ui") {
    await publish(session, `crisis/cmd/escalate/${incidentId}`, { type: "escalate", incidentId, user, at: new Date().toISOString() });
}
export async function publishResolve(session: SolaceSession, incidentId: string, user = "ui") {
    await publish(session, `crisis/cmd/resolve/${incidentId}`, { type: "resolve", incidentId, user, at: new Date().toISOString() });
}
