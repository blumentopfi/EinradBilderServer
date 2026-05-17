#!/usr/bin/env bash
# Install the Einrad Bildergalerie as a systemd service.
# Usage: sudo bash scripts/install-service.sh
set -euo pipefail

SERVICE_NAME="gallery.service"
UNIT_DEST="/etc/systemd/system/${SERVICE_NAME}"

if [[ "${EUID}" -ne 0 ]]; then
    echo "Error: must be run with sudo (root)." >&2
    echo "Try: sudo bash $0" >&2
    exit 1
fi

if [[ -z "${SUDO_USER:-}" ]] || [[ "${SUDO_USER}" == "root" ]]; then
    echo "Error: this script must be invoked via sudo from a normal user shell," >&2
    echo "so the service can run as that user. Don't run as the root user directly." >&2
    exit 1
fi
RUN_USER="${SUDO_USER}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APPDIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
TEMPLATE="${SCRIPT_DIR}/gallery.service"

if [[ ! -f "${TEMPLATE}" ]]; then
    echo "Error: unit template not found at ${TEMPLATE}" >&2
    exit 1
fi

NODE_BIN="$(sudo -u "${RUN_USER}" bash -lc 'command -v node' || true)"
if [[ -z "${NODE_BIN}" ]]; then
    NODE_BIN="$(command -v node || true)"
fi
if [[ -z "${NODE_BIN}" ]]; then
    echo "Error: 'node' not found on PATH (checked as ${RUN_USER} and as root)." >&2
    echo "Install Node.js first, e.g. via NodeSource:" >&2
    echo "  curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -" >&2
    echo "  sudo apt-get install -y nodejs" >&2
    exit 1
fi

for required in "server.js" ".env" "node_modules"; do
    if [[ ! -e "${APPDIR}/${required}" ]]; then
        echo "Error: ${APPDIR}/${required} is missing." >&2
        if [[ "${required}" == "node_modules" ]]; then
            echo "Run 'npm install' in ${APPDIR} first." >&2
        elif [[ "${required}" == ".env" ]]; then
            echo "Copy .env.example to .env and fill it in first." >&2
        fi
        exit 1
    fi
done

echo "Installing ${SERVICE_NAME}"
echo "  User:    ${RUN_USER}"
echo "  AppDir:  ${APPDIR}"
echo "  Node:    ${NODE_BIN}"

TMP_UNIT="$(mktemp)"
trap 'rm -f "${TMP_UNIT}"' EXIT

sed \
    -e "s|__USER__|${RUN_USER}|g" \
    -e "s|__APPDIR__|${APPDIR}|g" \
    -e "s|__NODE__|${NODE_BIN}|g" \
    "${TEMPLATE}" > "${TMP_UNIT}"

install -m 0644 "${TMP_UNIT}" "${UNIT_DEST}"

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}"

echo
systemctl --no-pager status "${SERVICE_NAME}" || true
echo
echo "Done. Follow logs with: journalctl -u ${SERVICE_NAME} -f"
