# publisher.py
# pip install --upgrade solace-pubsubplus
import os, time, json, uuid, random, signal
from datetime import datetime, timezone

from solace.messaging.messaging_service import MessagingService, RetryStrategy
from solace.messaging.resources.topic import Topic
from solace.messaging.config.authentication_strategy import BasicUserNamePassword
from solace.messaging.config.solace_properties import (
    service_properties as sp,
    transport_layer_properties as tlp,
    transport_layer_security_properties as tls,  # TLS controls
)

# ---- Your Solace Cloud connection (defaults) ----
# (kept your username override "publisher-client" as in your snippet)
HOST = os.getenv("SOLACE_HOST", "tcps://mr-connection-bhu01kaceym.messaging.solace.cloud:55443")
VPN  = os.getenv("SOLACE_VPN",  "crisis-broker")
USER = os.getenv("SOLACE_USER", "publisher-client")
PASS = os.getenv("SOLACE_PASS", "giovanny-bless-win")

# Normalize accidental WebSocket URL -> SMF/TLS
if HOST.startswith("wss://"):
    HOST = HOST.replace("wss://", "tcps://").replace(":443", ":55443")

INTERVAL_SEC = float(os.getenv("PUBLISH_INTERVAL_SEC", "1.5"))
REGION_PATH  = os.getenv("REGION_PATH", "ottawa")  # crisis/events/<source>/<region>/<type>/<sev>

print(f"[publisher] Connecting to {HOST} vpn={VPN} as {USER} ...")
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
    .with_reconnection_retry_strategy(RetryStrategy.parametrized_retry(20, 3))
    .build()
)
ms.connect()

pub = ms.create_direct_message_publisher_builder().build()
pub.start()
msgb = ms.message_builder()
print("[publisher] Connected & publisher started.")

def random_incident():
    types = ["flood","accident","assault","disease","earthquake","fire"]
    sevs  = ["low","med","high","critical"]
    typ   = random.choice(types)
    sev   = random.choice(sevs)
    lat   = 45.3215 + (random.random() - 0.5) * 0.35
    lng   = -75.8572 + (random.random() - 0.5) * 0.55
    lanes = random.randint(0,2) if random.random() < 0.4 else 0
    return {
        "id": "py_" + uuid.uuid4().hex[:6],
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": typ,
        "severity": sev,
        "source": "sensor",
        "headline": f"{typ.title()} reported",
        "summary": "Mock event from Python publisher",
        "location": {"lat": lat, "lng": lng, "city": "Ottawa", "country": "CA"},
        "jurisdiction": "Ottawa, ON",
        "injuredCount": random.randint(0,3) if random.random() < 0.35 else 0,
        "lanesBlocked": lanes,
        "roadClosed": lanes >= 2,
        "powerOutage": (typ == "flood") and (random.random() < 0.3),
        "shelterNeeded": (typ == "flood") and (sev != "low") and (random.random() < 0.4),
        "displacedPeople": random.randint(0,200) if typ == "flood" else 0,
    }

_running = True
def _stop(*_):
    global _running
    _running = False
for sig in (signal.SIGINT, signal.SIGTERM):
    signal.signal(sig, _stop)

try:
    while _running:
        inc = random_incident()
        topic = f"crisis/events/{inc['source']}/{REGION_PATH}/{inc['type']}/{inc['severity']}"
        # Build outbound as bytearray (avoids attachment errors)
        outbound = msgb.build(bytearray(json.dumps(inc).encode("utf-8")))
        pub.publish(destination=Topic.of(topic), message=outbound)
        print(f"[publisher] Published -> {topic}")
        time.sleep(INTERVAL_SEC)
except Exception as e:
    print("[publisher] ERROR:", e)
finally:
    try: pub.terminate()
    except: pass
    try: ms.disconnect()
    except: pass
    print("[publisher] Stopped.")
