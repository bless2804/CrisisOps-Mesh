// Minimal helper to connect & subscribe to a Solace PubSub+ broker from the browser.
export type SolaceSession = any;

export async function connectSolace(opts: {
    url: string; vpnName: string; userName: string; password: string;
}): Promise<SolaceSession> {
    const solace = (await import('solclientjs')).default;

    solace.SolclientFactory.init({
        profile: solace.SolclientFactoryProfiles.version10,
    });

    const session = solace.SolclientFactory.createSession({
        url: opts.url,
        vpnName: opts.vpnName,
        userName: opts.userName,
        password: opts.password,
        connectRetries: 3,
        generateReceiveTimestamps: true,
        generateSendTimestamps: true,
    });

    await new Promise<void>((resolve, reject) => {
        session.on(solace.SessionEventCode.UP_NOTICE, () => resolve());
        session.on(solace.SessionEventCode.CONNECT_FAILED_ERROR, (e: any) => reject(e));
        session.on(solace.SessionEventCode.DISCONNECTED, () => console.warn("Solace disconnected"));
        session.connect();
    });

    return session;
}

export async function subscribe(session: SolaceSession, topic: string, onEvent: (obj: any) => void) {
    const solace = (await import('solclientjs')).default;
    session.on(solace.SessionEventCode.MESSAGE, (msg: any) => {
        const payload = msg.getBinaryAttachment();
        try { onEvent(JSON.parse(payload)); } catch { }
    });
    session.subscribe(
        solace.SolclientFactory.createTopicDestination(topic),
        true,
        topic,
        1000
    );
}
