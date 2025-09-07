# subscriber.py
# pip install --upgrade solace-pubsubplus
import os, json, time, signal

from solace.messaging.messaging_service import MessagingService
from solace.messaging.resources.topic import Topic
from solace.messaging.config.authentication_strategy import BasicUserNamePassword
from solace.messaging.config.solace_properties import (
    service_properties as sp,
    transport_layer_properties as tlp,
    transport_layer_security_properties as tls,  # TLS controls
)
try:
    from solace.messaging.resources.topic_subscription import TopicSubscription
except Exception:
    from solace.messaging.config.topic_subscription import TopicSubscription

from solace.messaging.receiver.message_receiver import MessageHandler
from solace.messaging.receiver.inbound_message import InboundMessage

# ---- Your Solace Cloud connection (defaults) ----
broker_props = {
  "solace.messaging.transport.host.secured": "tcps://mr-connection-bhu01kaceym.messaging.solace.cloud:55443",
  "solace.messaging.service.vpn-name": "crisis-broker",
  "solace.messaging.authentication.scheme.basic.username": "solace-cloud-client",
  "solace.messaging.authentication.scheme.basic.password": "gakeduhcr4rmd340ceqnruqtv1",
}

HOST = os.getenv("SOLACE_HOST", broker_props["solace.messaging.transport.host.secured"])
VPN  = os.getenv("SOLACE_VPN",  broker_props["solace.messaging.service.vpn-name"])
USER = os.getenv("SOLACE_USER", broker_props["solace.messaging.authentication.scheme.basic.username"])
PASS = os.getenv("SOLACE_PASS", broker_props["solace.messaging.authentication.scheme.basic.password"])

# Normalize accidental WebSocket URL -> SMF/TLS
if HOST.startswith("wss://"):
    HOST = HOST.replace("wss://", "tcps://").replace(":443", ":55443")

EVENTS_SUB   = os.getenv("EVENTS_SUB",  "crisis/events/>")   # listen
AGENCY_BASE  = os.getenv("AGENCY_BASE", "crisis/agency")     # publish

def route_agencies(i: dict):
    targets = set(i.get("agencyTargets", []))
    t = (i.get("type","") or "").lower()
    sev = (i.get("severity","") or "").lower()
    injured = int(i.get("injuredCount") or 0)
    lanes   = int(i.get("lanesBlocked") or 0)

    if t in ["assault","robbery","riot","theft"]:
        targets.add("law")
    if t in ["fire","vehicle_fire","smoke","hazmat","collapse","rescue"]:
        targets.add("fire")
    if t in ["accident","crash"]:
        targets.update(["law","transport"])
    if t in ["flood","earthquake","wildfire","storm"]:
        targets.update(["fire","utilities","law"])
    if injured > 0 or i.get("medicalNeed") or i.get("massCasualty"):
        targets.add("ems")
    if i.get("emsInbound") or i.get("expectedSurge"):
        targets.add("hospitals")
    if i.get("powerOutage") or i.get("downedLines") or i.get("waterMainBreak"):
        targets.add("utilities")
    if lanes >= 1 or i.get("transitDisruption") or i.get("roadClosed"):
        targets.add("transport")
    if i.get("shelterNeeded") or (t in ["flood","earthquake"] and sev in ["high","critical"]):
        targets.add("ngos")
    return sorted(targets)

print(f"[subscriber] Connecting to {HOST} vpn={VPN} as {USER} ...")
ms = (
    MessagingService.builder()
    .from_properties({
        tlp.HOST: HOST,
        sp.VPN_NAME: VPN,
        # DEV-ONLY: disable TLS validation & hostname check
        tls.CERT_VALIDATED: False,
        tls.CERT_VALIDATE_SERVERNAME: False,
    })
    .with_authentication_strategy(BasicUserNamePassword(USER, PASS))
    .build()
)
ms.connect()

# Create publisher and a reusable message builder
pub = ms.create_direct_message_publisher_builder().build()
pub.start()
msgb = ms.message_builder()

rx = (
    ms.create_direct_message_receiver_builder()
    .with_subscriptions([TopicSubscription.of(EVENTS_SUB)])
    .build()
)
rx.start()
print(f"[subscriber] Subscribed to {EVENTS_SUB}")

class Router(MessageHandler):
    def on_message(self, message: InboundMessage):
        try:
            inc = json.loads(message.get_payload_as_string())
        except Exception:
            return

        region = (inc.get("jurisdiction") or "unknown").lower().replace(", ", "_").replace(" ", "_")
        typ = (inc.get("type") or "unknown").lower()
        sev = (inc.get("severity") or "low").lower()

        agencies = route_agencies(inc)
        inc["agencyTargets"] = agencies

        # Build outbound as bytearray (fixes attachment error)
        body = json.dumps(inc).encode("utf-8")
        data = bytearray(body)

        for a in agencies:
            topic = f"{AGENCY_BASE}/{a}/{region}/{typ}/{sev}"
            outbound = msgb.build(data)
            pub.publish(destination=Topic.of(topic), message=outbound)
            print(f"[subscriber] Routed -> {topic}")

    def on_error(self, exception: Exception):
        print("[subscriber] Handler error:", exception)

# Register handler
rx.receive_async(Router())

_running = True
def _stop(*_):
    global _running
    _running = False
for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, _stop)

print("[subscriber] Routing… press Ctrl+C to stop")
try:
    while _running:
        time.sleep(0.25)
finally:
    try: rx.terminate()
    except: pass
    try: pub.terminate()
    except: pass
    try: ms.disconnect()
    except: pass
    print("[subscriber] Stopped.")
