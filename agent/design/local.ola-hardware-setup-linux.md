# OLA & Hardware Setup Guide (Linux)

**Concept**: How to install OLA on Linux, configure the Enttec USB DMX adapter, and verify the DMX pipeline before using dmx-mcp
**Created**: 2026-03-01
**Status**: Design Specification

---

## Overview

The dmx-mcp server never talks to DMX hardware directly. It communicates with OLA (Open Lighting Architecture) via REST API on localhost:9090, and OLA handles the actual DMX transport to hardware. This document covers the full setup chain: installing OLA, plugging in the Enttec adapter, configuring OLA to use it, and verifying the pipeline works before connecting dmx-mcp.

---

## Problem Statement

- The Enttec USB DMX adapter doesn't work out of the box — it needs OLA as an intermediary
- OLA requires configuration to map a DMX universe to the physical adapter
- Without a verified OLA setup, dmx-mcp tools will silently fail or error with connection refused
- The setup process involves Linux device detection, daemon management, and web UI configuration — steps that should be documented clearly

---

## Solution

A step-by-step setup process:

```
Enttec USB-C DMX  →  Linux /dev/ttyUSB0  →  OLA daemon (olad)  →  REST API :9090  →  dmx-mcp
```

### Connection Chain

```
┌──────────────────┐     USB      ┌──────────────────┐
│  Enttec USB DMX  │─────────────▶│  Linux host       │
│  adapter         │              │  /dev/ttyUSB0     │
└──────────────────┘              └────────┬─────────┘
                                           │
                                  ┌────────▼─────────┐
                                  │  OLA daemon       │
                                  │  (olad)           │
                                  │  - USB serial     │
                                  │    plugin         │
                                  │  - Universe 1     │
                                  │    → Enttec port  │
                                  └────────┬─────────┘
                                           │ HTTP REST
                                  ┌────────▼─────────┐
                                  │  localhost:9090   │
                                  │  POST /set_dmx    │
                                  │  GET  /get_dmx    │
                                  └────────┬─────────┘
                                           │ MCP
                                  ┌────────▼─────────┐
                                  │  dmx-mcp server   │
                                  └──────────────────┘
```

---

## Implementation

### Step 1: Install OLA

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install ola
```

**From source (if package is outdated):**
```bash
# See https://www.openlighting.org/ola/getting-started/
sudo apt install git libtool autoconf automake g++ pkg-config \
  libcppunit-dev uuid-dev libprotobuf-dev protobuf-compiler \
  libftdi-dev libusb-1.0-0-dev
git clone https://github.com/OpenLightingProject/ola.git
cd ola
autoreconf -i
./configure
make
sudo make install
sudo ldconfig
```

**Verify installation:**
```bash
olad --version
# Expected: OLA Daemon version x.x.x
```

### Step 2: Plug in Enttec Adapter

Connect the Enttec USB-C DMX adapter. Linux should detect it as a USB serial device.

**Verify detection:**
```bash
# Check for USB serial device
ls /dev/ttyUSB* /dev/ttyACM*
# Expected: /dev/ttyUSB0 (or /dev/ttyACM0)

# Check kernel messages
dmesg | tail -20
# Expected: "FTDI USB Serial Device converter now attached to ttyUSB0"
# or similar for Enttec Pro: "Enttec DMX USB Pro"
```

**If device not found:**
```bash
# Check USB devices are visible
lsusb
# Look for FTDI or Enttec in the output

# Check permissions (user may need dialout group)
sudo usermod -aG dialout $USER
# Then log out and back in
```

### Step 3: Start OLA Daemon

```bash
# Start in foreground (for debugging)
olad -l 3
# -l 3 = info-level logging

# Or start via systemd (background)
sudo systemctl start olad
sudo systemctl enable olad   # auto-start on boot

# Verify it's running
curl -s http://localhost:9090/json/server_info | head
# Expected: JSON with server version info
```

**OLA config directory:** `~/.ola/` (created on first run)

### Step 4: Configure Universe in OLA

**Option A: Web UI (recommended for first setup)**

1. Open `http://localhost:9090` in a browser
2. Click **"Add Universe"** in the left sidebar
3. Set:
   - **Universe ID**: `1`
   - **Universe Name**: `DMX Output`
4. Under **Output Ports**, find the Enttec device:
   - For **Enttec Open DMX USB**: Look for "Open DMX USB" port
   - For **Enttec DMX USB Pro**: Look for "Enttec USB Pro" port
5. Check the box to assign it as an **output** port for Universe 1
6. Click **Save**

**Option B: Config files**

OLA stores config in `~/.ola/`:
```bash
# List config files
ls ~/.ola/
# ola-opendmx.conf   (Open DMX USB)
# ola-usbpro.conf    (DMX USB Pro)
# ola-universe.conf  (universe assignments)
```

Example `~/.ola/ola-usbpro.conf`:
```ini
device_dir = /dev
device_prefix = ttyUSB
enabled = true
```

### Step 5: Verify DMX Output

**Using OLA command-line tools:**
```bash
# List configured universes
ola_uni_list
# Expected: Universe 1 (DMX Output)

# Send test DMX values (set first 3 channels to R=255, G=0, B=128)
ola_set_dmx -u 1 -d 255,0,128

# Read back current DMX values
ola_get_dmx -u 1
# Expected: 255,0,128,0,0,0,...

# Continuous test pattern (ramps channel 1 up and down)
ola_streaming_client -u 1
```

**Using REST API (what dmx-mcp uses):**
```bash
# Set DMX values via REST
curl -X POST http://localhost:9090/set_dmx \
  -d "u=1&d=255,0,128"

# Read DMX values via REST
curl -s "http://localhost:9090/get_dmx?u=1" | python3 -m json.tool
# Expected: {"dmx": [255, 0, 128, 0, 0, ...], "universe": 1}
```

**Using OLA web monitor:**

Navigate to `http://localhost:9090/new/#/universe/1/dmx_monitor` to see real-time DMX values visually.

### Step 6: Verify with Physical Lights

If a DMX fixture is connected to the Enttec adapter:

1. Check the fixture's DMX address (set on the fixture itself, often via DIP switches or LCD)
2. Send values to those channels:
   ```bash
   # If fixture is at address 1 and is RGB (3 channels):
   ola_set_dmx -u 1 -d 255,0,0      # Red
   ola_set_dmx -u 1 -d 0,255,0      # Green
   ola_set_dmx -u 1 -d 0,0,255      # Blue
   ola_set_dmx -u 1 -d 255,255,255  # White
   ola_set_dmx -u 1 -d 0,0,0        # Off
   ```
3. Verify the light responds to each command

---

## Enttec Adapter Variants

| Adapter | Protocol | OLA Plugin | Reliability | RDM Support | Price |
|---------|----------|------------|-------------|-------------|-------|
| Enttec Open DMX USB | Bit-banged serial | `opendmx` | Fair (timing-sensitive) | No | ~$30 |
| Enttec DMX USB Pro | Firmware-based | `usbpro` | Excellent | Yes | ~$120 |
| Enttec DMX USB Pro Mk2 | Firmware-based | `usbpro` | Excellent | Yes (2 ports) | ~$200 |
| Enttec USB-C DMX | Same as Pro | `usbpro` | Excellent | Yes | ~$130 |

**Recommendation**: Use DMX USB Pro or USB-C variant for reliable operation. The Open DMX USB is cheap but relies on bit-banged serial timing from the host, which can be flaky under CPU load.

---

## Benefits

- **Clear pipeline**: Each component has a single responsibility
- **Hardware agnostic**: OLA supports Art-Net, sACN, and many USB dongles — switch hardware without changing dmx-mcp
- **Debuggable**: OLA web UI provides real-time DMX monitoring
- **Standard tools**: `ola_set_dmx` and `ola_get_dmx` allow testing without dmx-mcp

---

## Trade-offs

- **OLA dependency**: Must be installed and running; adds infrastructure
- **Latency**: REST API adds ~1-5ms per call (fine for show programming, may matter for tight effects)
- **Linux-focused**: OLA runs best on Linux; macOS support exists but may lag; Windows not supported
- **Permissions**: USB serial devices require `dialout` group membership

---

## Dependencies

- **OLA** (Open Lighting Architecture) — `apt install ola` or build from source
- **Enttec USB DMX adapter** — any variant (Open DMX, Pro, USB-C)
- **Linux** — Ubuntu/Debian recommended; macOS possible but less tested
- **FTDI drivers** — usually included in Linux kernel (`ftdi_sio` module)

---

## Testing Strategy

- **Verify OLA running**: `curl http://localhost:9090/json/server_info` returns JSON
- **Verify universe configured**: `ola_uni_list` shows Universe 1
- **Verify DMX write**: `ola_set_dmx -u 1 -d 255` then `ola_get_dmx -u 1` returns 255
- **Verify REST API**: `curl -X POST localhost:9090/set_dmx -d "u=1&d=128"` succeeds
- **Verify hardware**: Physical light responds to `ola_set_dmx` commands

---

## Troubleshooting

### OLA daemon won't start
```bash
# Check if already running
pgrep olad
# Kill stale process if needed
sudo killall olad
# Check port conflict
ss -tlnp | grep 9090
```

### Device not detected (/dev/ttyUSB0 missing)
```bash
# Check USB connection
lsusb | grep -i ftdi
# Load FTDI driver manually
sudo modprobe ftdi_sio
# Check kernel log
dmesg | grep -i usb
```

### Permission denied on /dev/ttyUSB0
```bash
# Add user to dialout group
sudo usermod -aG dialout $USER
# Log out and back in, then verify
groups | grep dialout
```

### OLA web UI shows no ports
- Restart olad after plugging in the adapter
- Check `~/.ola/ola-opendmx.conf` or `~/.ola/ola-usbpro.conf` has `enabled = true`

### DMX values set but lights don't respond
- Verify fixture DMX address matches what you're sending
- Check DMX cable polarity (pin 2 = data-, pin 3 = data+)
- Try a different fixture to rule out hardware issues
- Use OLA's DMX monitor to confirm values are being sent

---

## Future Considerations

- **Art-Net support**: OLA also supports Art-Net nodes — document setup for wireless/networked DMX
- **Docker setup**: Package OLA in a Docker container for easier deployment
- **Auto-detection**: Script to auto-detect Enttec adapters and configure OLA
- **Multi-adapter**: Document using multiple Enttec adapters for multiple universes
- **Raspberry Pi**: Document OLA setup on Raspberry Pi for portable DMX controller

---

**Status**: Design Specification
**Recommendation**: Use this guide before first dmx-mcp session. Verify OLA works independently before debugging dmx-mcp issues.
**Related Documents**: [DMX Lighting MCP Design](local.dmx-lighting-mcp.md)
