#!/bin/bash
# TacTix Security Firewall Configuration
# This script configures UFW to block external access to TacTix services

set -e

echo "=== TacTix Firewall Setup ==="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (sudo ./setup_firewall.sh)"
    exit 1
fi

# Check if ufw is installed
if ! command -v ufw &> /dev/null; then
    echo "UFW not found. Installing..."
    apt-get update && apt-get install -y ufw
fi

echo "[1/4] Blocking external access to TacTix backend (port 5001)..."
ufw deny from any to any port 5001 comment 'TacTix Backend - Blocked'

echo "[2/4] Blocking external access to TacTix frontend dev server (port 5173)..."
ufw deny from any to any port 5173 comment 'TacTix Frontend Dev - Blocked'

echo "[3/4] Allowing localhost connections (loopback)..."
# UFW allows loopback by default, but ensure it's enabled
ufw allow in on lo

echo "[4/4] Enabling UFW..."
ufw --force enable

echo ""
echo "=== Firewall Configuration Complete ==="
echo ""
echo "Current UFW status:"
ufw status verbose | grep -E "(5001|5173|Status)"
echo ""
echo "TacTix services are now only accessible from localhost."
echo "To access remotely, use SSH tunneling:"
echo "  ssh -L 5173:localhost:5173 -L 5001:localhost:5001 user@server"
echo ""
