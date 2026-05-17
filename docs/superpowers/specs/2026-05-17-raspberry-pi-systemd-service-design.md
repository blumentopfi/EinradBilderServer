# Raspberry Pi systemd service — Design

**Date:** 2026-05-17
**Status:** Draft, pending user approval

## Goal

Add a script-driven way to run the Einrad Bildergalerie Node app as a native systemd service on a Raspberry Pi: auto-start on boot, restart on crash, logs via `journalctl`. Replaces ad-hoc `npm start` and provides a lighter-weight alternative to the PM2 instructions currently in `CLAUDE.md`.

## Scope

In scope:

- A systemd unit template installed to `/etc/systemd/system/gallery.service`.
- A bash installer that fills in user/path placeholders, installs the unit, enables and starts it.
- A bash uninstaller that stops, disables, removes the unit, and reloads systemd.
- A short README / CLAUDE.md addition pointing at these scripts, alongside the existing PM2 instructions.

Out of scope:

- HTTPS, reverse proxy, DNS, port forwarding — already covered by `HTTPS-SETUP.md`.
- Firewall configuration — already in `SECURITY.md`.
- Replacing or removing the existing PM2 instructions.
- Multi-instance / multi-user setups.
- Node version management (assumes a working `node` on `PATH`).

## Files to add

### `scripts/gallery.service` (unit template)

A systemd unit file with three placeholders that the installer substitutes:

- `__USER__` — the OS user the service runs as
- `__APPDIR__` — the absolute path to the project directory
- `__NODE__` — the absolute path to the `node` binary (resolved via `command -v node` at install time)

Key directives:

| Directive | Value | Why |
|---|---|---|
| `User` | `__USER__` | Don't run as root |
| `WorkingDirectory` | `__APPDIR__` | So relative paths in `.env` (`IMAGES_DIR=./media`) resolve correctly |
| `EnvironmentFile` | `__APPDIR__/.env` | Load gallery config (`PORT`, `SESSION_SECRET`, etc.) |
| `ExecStart` | `__NODE__ server.js` | Run the app; works with apt-installed node, nvm, or any other node on `PATH` |
| `Restart` | `on-failure` | Auto-restart on crash, but not on clean exit |
| `RestartSec` | `5` | Brief backoff between restart attempts |
| `After` / `Wants` | `network-online.target` | Don't start before the network is up |
| `StandardOutput` / `StandardError` | `journal` | Logs accessible via `journalctl -u gallery` |
| `NoNewPrivileges` | `true` | Hardening |
| `ProtectSystem` | `full` | Read-only `/usr`, `/boot`, `/etc` for the process |
| `PrivateTmp` | `true` | Isolated `/tmp` |
| `WantedBy` (Install) | `multi-user.target` | Standard auto-start target |

### `scripts/install-service.sh`

Bash installer. Behavior:

1. Require root (`EUID == 0`); print sudo hint and exit if not.
2. Derive `APPDIR` as the project root (parent of the `scripts/` dir containing this script), resolved with `readlink -f`.
3. Derive `RUN_USER` from `$SUDO_USER`; if unset, fail with a clear message (running `sudo` from an interactive shell is required so we know which user owns the project).
4. Sanity checks (fail fast with a readable error if any fail):
   - `command -v node` resolves.
   - `$APPDIR/server.js` exists.
   - `$APPDIR/.env` exists.
   - `$APPDIR/node_modules` exists (hint: run `npm install` first).
5. Substitute `__USER__`, `__APPDIR__`, and `__NODE__` in the template, write the result to `/etc/systemd/system/gallery.service`.
6. `systemctl daemon-reload`.
7. `systemctl enable --now gallery.service`.
8. Print status (`systemctl status gallery --no-pager`) and a hint: `journalctl -u gallery -f` to follow logs.

Idempotent: re-running the installer overwrites the unit and restarts the service.

### `scripts/uninstall-service.sh`

Symmetric counterpart. Behavior:

1. Require root.
2. `systemctl disable --now gallery.service` (tolerate "not loaded" errors).
3. `rm -f /etc/systemd/system/gallery.service`.
4. `systemctl daemon-reload`.
5. Print confirmation.

## Documentation changes

Add a "Auto-start with systemd" subsection to the Raspberry Pi deployment section of `CLAUDE.md` (and a brief mirror in `README.md` if that file has a deployment section). Content:

- One-paragraph rationale: lighter than PM2, native to the OS, journald logs.
- Three commands: `cd` to project, `sudo bash scripts/install-service.sh`, view logs with `journalctl -u gallery -f`.
- Pointer to `scripts/uninstall-service.sh` for removal.

The existing PM2 section stays — users pick one or the other.

## Verification

Manual checks the user (or a future test plan) should perform on an actual Pi:

1. `sudo bash scripts/install-service.sh` succeeds; `systemctl status gallery` shows `active (running)`.
2. `curl http://localhost:3000/check-auth` returns a JSON response from the app.
3. `sudo reboot`; after reboot, `systemctl is-active gallery` returns `active`.
4. Kill the node process; within ~5s `systemctl status gallery` shows it restarted.
5. `sudo bash scripts/uninstall-service.sh` removes the unit; `systemctl status gallery` reports "could not be found".

## Risks and decisions

- **Node path resolution.** systemd requires an absolute `ExecStart`; we can't rely on `$PATH`. Resolved at install time via `command -v node` and substituted into `__NODE__`. Works for apt-installed (`/usr/bin/node`), NodeSource, or nvm setups equally.
- **`.env` as `EnvironmentFile`.** systemd's `EnvironmentFile` parser is stricter than dotenv (no quoting subtleties, no `export`, no `${VAR}` expansion). The existing `.env.example` uses plain `KEY=value` lines which are compatible. Decision: accept this constraint; mention it in the doc subsection.
- **No log rotation config.** journald handles rotation by default — no extra config needed.
