#!/usr/bin/env bash
# Remove the Einrad Bildergalerie systemd service.
# Usage: sudo bash scripts/uninstall-service.sh
set -euo pipefail

SERVICE_NAME="gallery.service"
UNIT_DEST="/etc/systemd/system/${SERVICE_NAME}"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Error: must be run with sudo (root)." >&2
    echo "Try: sudo bash $0" >&2
    exit 1
fi

if systemctl list-unit-files "${SERVICE_NAME}" --no-legend | grep -q "${SERVICE_NAME}"; then
    systemctl disable --now "${SERVICE_NAME}" || true
fi

if [[ -f "${UNIT_DEST}" ]]; then
    rm -f "${UNIT_DEST}"
    echo "Removed ${UNIT_DEST}"
else
    echo "No unit file at ${UNIT_DEST}, nothing to remove."
fi

systemctl daemon-reload

echo "Done. ${SERVICE_NAME} uninstalled."
