# OLA & Hardware Setup Guide (macOS)

**Concept**: How to install OLA on macOS, configure the Enttec USB DMX adapter, and verify the DMX pipeline before using dmx-mcp
**Created**: 2026-03-01
**Status**: Design Specification

---

## Overview

This is the macOS companion to the [Linux setup guide](local.ola-hardware-setup-linux.md). The dmx-mcp server communicates with OLA via REST API on localhost:9090, and OLA handles DMX transport to hardware. OLA works on macOS but has some platform-specific differences: device paths, installation method, daemon management, and adapter compatibility.

**Important**: The Enttec DMX USB Pro or USB-C adapter is **strongly recommended** on macOS. The cheap Enttec Open DMX USB is unreliable on macOS due to bit-banged serial timing issues.

---

## Problem Statement

- OLA installation on macOS differs from Linux (Homebrew vs apt)
- USB serial devices appear at different paths (`/dev/tty.usbserial-*` vs `/dev/ttyUSB0`)
- macOS has no `systemd` — daemon management differs
- FTDI driver situation on macOS can be tricky (Apple vs FTDI drivers)
- Less community testing means more potential for edge cases

---

## Solution

The same pipeline applies, with macOS-specific paths:

```
Enttec USB-C DMX  →  macOS /dev/tty.usbserial-*  →  OLA daemon (olad)  →  REST API :9090  →  dmx-mcp
```

### Connection Chain

```
┌──────────────────┐     USB      ┌──────────────────────┐
│  Enttec USB DMX  │─────────────▶│  macOS host           │
│  adapter         │              │  /dev/tty.usbserial-* │
└──────────────────┘              └────────┬─────────────┘
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

### Step 1: Install OLA via Homebrew

```bash
brew install ola
```

**If Homebrew formula is outdated or missing**, build from source:
```bash
# Install build dependencies
brew install autoconf automake libtool pkg-config protobuf libftdi libusb cppunit

# Clone and build
git clone https://github.com/OpenLightingProject/ola.git
cd ola
autoreconf -i
./configure
make
sudo make install
```

**Verify installation:**
```bash
olad --version
# Expected: OLA Daemon version x.x.x

which olad
# Expected: /usr/local/bin/olad or /opt/homebrew/bin/olad
```

### Step 2: Handle FTDI Drivers

macOS has a built-in FTDI driver (AppleUSBFTDI) that can conflict with OLA's access to the Enttec adapter. This is the most common source of issues on macOS.

**Check if Apple's driver is loaded:**
```bash
kextstat | grep FTDI
# If you see "com.apple.driver.AppleUSBFTDI" — it may grab the device before OLA can
```

**If OLA can't see the adapter (Apple driver conflict):**
```bash
# Temporarily unload Apple's FTDI driver
sudo kextunload -b com.apple.driver.AppleUSBFTDI

# On newer macOS (Big Sur+), you may need to disable SIP or use:
sudo kextunload /System/Library/Extensions/AppleUSBFTDI.kext
```

**Note**: On macOS Ventura+ with Apple Silicon, the FTDI situation has improved. The Enttec Pro/USB-C adapters generally work without driver conflicts because they use a different USB descriptor than generic FTDI devices.

**If you need the FTDI VCP driver:**
```bash
# Download from https://ftdichip.com/drivers/vcp-drivers/
# Install the macOS .dmg package
# Reboot after installation
```

### Step 3: Plug in Enttec Adapter

Connect the Enttec USB DMX adapter.

**Verify detection:**
```bash
# List USB serial devices
ls /dev/tty.usbserial-*
# Expected: /dev/tty.usbserial-EN123456 (serial number varies)

# Alternative: list all tty devices
ls /dev/tty.usb*

# Check system profiler for USB devices
system_profiler SPUSBDataType | grep -A 5 -i "enttec\|ftdi"
```

**If device not found:**
```bash
# Check USB devices are visible
system_profiler SPUSBDataType
# Look for FTDI or Enttec in the output

# Check if Apple FTDI driver grabbed it (see Step 2)
kextstat | grep FTDI

# Try unplugging and replugging the adapter
```

### Step 4: Start OLA Daemon

macOS doesn't have systemd, so run olad directly or use launchd.

**Run in foreground (for debugging):**
```bash
olad -l 3
# -l 3 = info-level logging
```

**Run in background:**
```bash
olad -l 3 &
# Or use nohup:
nohup olad -l 3 > /tmp/olad.log 2>&1 &
```

**Auto-start via launchd (optional):**

Create `~/Library/LaunchAgents/org.openlighting.olad.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>org.openlighting.olad</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/olad</string>
        <string>-l</string>
        <string>3</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/olad.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/olad.stderr.log</string>
</dict>
</plist>
```

```bash
# Load the launch agent
launchctl load ~/Library/LaunchAgents/org.openlighting.olad.plist

# Verify it's running
curl -s http://localhost:9090/json/server_info | head
```

**OLA config directory:** `~/.ola/` (created on first run)

### Step 5: Configure Universe in OLA

Same as Linux — the web UI works identically.

**Option A: Web UI (recommended)**

1. Open `http://localhost:9090` in a browser
2. Click **"Add Universe"**
3. Set Universe ID: `1`, Name: `DMX Output`
4. Under **Output Ports**, find the Enttec device:
   - For **Enttec DMX USB Pro**: Look for "Enttec USB Pro" port
   - The device path will show `/dev/tty.usbserial-*`
5. Assign as **output** port for Universe 1
6. Click **Save**

**Option B: Config files**

```bash
ls ~/.ola/
# ola-usbpro.conf    (DMX USB Pro)
# ola-universe.conf  (universe assignments)
```

Example `~/.ola/ola-usbpro.conf`:
```ini
device_dir = /dev
device_prefix = tty.usbserial
enabled = true
```

**Note**: The `device_prefix` on macOS is `tty.usbserial` (not `ttyUSB` like Linux).

### Step 6: Verify DMX Output

**Using OLA command-line tools:**
```bash
# List configured universes
ola_uni_list
# Expected: Universe 1 (DMX Output)

# Send test DMX values
ola_set_dmx -u 1 -d 255,0,128

# Read back current DMX values
ola_get_dmx -u 1
# Expected: 255,0,128,0,0,0,...
```

**Using REST API:**
```bash
# Set DMX values via REST
curl -X POST http://localhost:9090/set_dmx \
  -d "u=1&d=255,0,128"

# Read DMX values via REST
curl -s "http://localhost:9090/get_dmx?u=1" | python3 -m json.tool
# Expected: {"dmx": [255, 0, 128, 0, 0, ...], "universe": 1}
```

### Step 7: Verify with Physical Lights

Same as Linux — see [Linux guide Step 6](local.ola-hardware-setup-linux.md) for fixture verification steps.

---

## Enttec Adapter Compatibility on macOS

| Adapter | macOS Support | Driver Issues | Recommendation |
|---------|--------------|---------------|----------------|
| Enttec Open DMX USB | Poor | Bit-banged timing unreliable on macOS | **Avoid on macOS** |
| Enttec DMX USB Pro | Good | May need Apple FTDI driver unloaded | Recommended |
| Enttec DMX USB Pro Mk2 | Good | Same as Pro | Recommended |
| Enttec USB-C DMX | Good | Generally works without driver conflicts | **Best for macOS** |

---

## Benefits

- **Same REST API**: dmx-mcp code is identical on macOS and Linux
- **Homebrew install**: Single command setup
- **Development friendly**: Develop on macOS, deploy on Linux/Raspberry Pi
- **Web UI**: OLA's web interface works identically across platforms

---

## Trade-offs

- **FTDI driver conflicts**: Apple's built-in driver can interfere with OLA
- **Less tested**: OLA community primarily uses Linux
- **No systemd**: Daemon management requires launchd or manual process management
- **Open DMX USB unreliable**: The cheapest adapter doesn't work well on macOS
- **macOS updates may break things**: OS updates can change USB driver behavior

---

## Dependencies

- **OLA** — `brew install ola` or build from source
- **Homebrew** — for easy installation
- **Enttec DMX USB Pro or USB-C** — strongly recommended over Open DMX USB
- **macOS 12+** — older versions may have different FTDI driver behavior
- **FTDI VCP driver** — may be needed if Apple's driver conflicts (download from ftdichip.com)

---

## Testing Strategy

- **Verify OLA running**: `curl http://localhost:9090/json/server_info` returns JSON
- **Verify device detected**: `ls /dev/tty.usbserial-*` shows device
- **Verify no driver conflict**: `kextstat | grep FTDI` shows expected state
- **Verify universe configured**: `ola_uni_list` shows Universe 1
- **Verify DMX write/read**: `ola_set_dmx` then `ola_get_dmx` round-trips
- **Verify REST API**: `curl -X POST localhost:9090/set_dmx -d "u=1&d=128"` succeeds

---

## Troubleshooting

### OLA can't see the Enttec adapter
```bash
# Most common cause: Apple FTDI driver grabbed the device
kextstat | grep FTDI
# If loaded, unload it:
sudo kextunload -b com.apple.driver.AppleUSBFTDI

# Then restart olad
killall olad && olad -l 3
```

### /dev/tty.usbserial-* doesn't appear
```bash
# Check if USB device is seen at all
system_profiler SPUSBDataType | grep -i ftdi

# If not seen: try a different USB port, different cable, or USB hub
# USB-C adapters on Apple Silicon sometimes need a direct port (no hub)
```

### olad crashes on startup
```bash
# Check logs
olad -l 4  # higher verbosity

# Common fix: delete stale config
rm -rf ~/.ola
olad -l 3  # will recreate defaults
```

### OLA web UI shows device but no DMX output
- Verify the port is assigned as an **output** (not input) in the universe config
- Try removing and re-adding the universe
- Check `~/.ola/ola-usbpro.conf` has `enabled = true`

### "Permission denied" accessing serial device
```bash
# On macOS, serial permissions are usually automatic
# If not, check the device permissions:
ls -la /dev/tty.usbserial-*
# Should be crw-rw-rw- or at least readable by your user
```

---

## Future Considerations

- **Apple Silicon native build**: Ensure OLA compiles natively on ARM64 (not via Rosetta)
- **Docker on macOS**: USB passthrough to Docker on macOS is limited — investigate alternatives
- **Wireless DMX**: Art-Net over network avoids all USB driver issues on macOS

---

**Status**: Design Specification
**Recommendation**: Use this guide for macOS development. For production/show environments, Linux is more reliable.
**Related Documents**: [Linux Setup Guide](local.ola-hardware-setup-linux.md), [DMX Lighting MCP Design](local.dmx-lighting-mcp.md)
