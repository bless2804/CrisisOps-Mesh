# CrisisOps Mesh

A real-time incident orchestration demo that uses **Solace Agent Mesh** and lightweight AI to classify, route, and visualize emergencies across agencies.

> **Hackathon build:** uses **mock event publishers** to simulate IoT/social feeds. The same topics/SDKs plug into real sources with no UI changes.

---

## ✨ What it does

* Ingests events (mocked) and assigns severity.
* Routes each incident via **topic-based messaging** to the right agency (law, fire, EMS, hospitals, utilities, transport, NGOs).
* Live **web console**: severity donut, activity chart, map, agency queues, and a clickable incident feed.

---

## 🧩 Architecture

```
[publisher.py]  -->  crisis/events/<source>/<region>/<type>/<severity>
                      |  (Solace PubSub+ / Agent Mesh)
[subscriber.py] -->  crisis/agency/<agency>/<region>/<type>/<severity>
                           |
                           v
                      Web Frontend (Vite + TS + Leaflet)
```

* **publisher.py** generates mock incidents and publishes to `crisis/events/...`
* **subscriber.py** subscribes to those, computes agency targets, and re-publishes to `crisis/agency/...`
* **Frontend** subscribes to the wildcard topic (e.g., `crisis/>`) and renders UI in real time.

---

## 🗂️ Repo layout

```
crisis-ops-main/
├─ src/
│  ├─ App.tsx                        # Shell + filters + sections
│  ├─ components/
│  │  ├─ Analytics.tsx              # Severity donut + Activity chart
│  │  ├─ MapView.tsx                # Leaflet map, clickable markers
│  │  ├─ AgencyQueues.tsx           # Scrollable queues per agency
│  │  ├─ IncidentDrawer.tsx         # Details panel (no action buttons)
│  │  └─ Toaster.tsx                # Tiny toast system
│  ├─ lib/
│  │  └─ solace.ts                  # Browser client helpers (connect/subscribe)
│  └─ types.ts                      # Incident & types
├─ publisher.py                      # Mock event generator -> crisis/events
├─ subscriber.py                     # Router -> crisis/agency
└─ README.md                         # This file
```

---

## 🚀 Quick start

### Prerequisites

* **Node 18+** and **npm** (or pnpm/yarn)
* **Python 3.10+**
* A **Solace Cloud** service (or on‑prem PubSub+) with **SMF TLS URL** (looks like `tcps://mr-xxxx.messaging.solace.cloud:55443`).

### 1) Configure Solace creds

You need the **SMF** (not WebSocket) URL.

**Windows PowerShell**

```powershell
$env:SOLACE_HOST="tcps://<your-host>:55443"
$env:SOLACE_VPN="<your-vpn>"
$env:SOLACE_USER="<username>"
$env:SOLACE_PASS="<password>"
```

**bash/zsh**

```bash
export SOLACE_HOST="tcps://<your-host>:55443"
export SOLACE_VPN="<your-vpn
```
