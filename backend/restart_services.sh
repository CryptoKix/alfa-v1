#!/bin/bash

# TACTIX Service Manager
# Used by Gemini to ensure backend changes take effect immediately.

# Get the directory where the script is located
SCRIPT_DIR=$( cd -- "$( dirname -- "$0" )" > /dev/null 2>&1 && pwd )
# Go to the project root (parent of backend)
cd "$SCRIPT_DIR/.."

echo "🔄 Restarting TACTIX Services from $(pwd)..."

# 1. Kill existing instances (Graceful first)
echo "🛑 Terminating existing services..."
pkill -f "supervisor.py"
pkill -f "app.py"
pkill -f "price_server.py"
pkill -f "sniper_outrider.py"
pkill -f "vite"

# Small wait to allow graceful exit
sleep 2

# Forced cleanup
pkill -9 -f "supervisor.py"
pkill -9 -f "app.py"
pkill -9 -f "price_server.py"
pkill -9 -f "sniper_outrider.py"
pkill -9 -f "vite"

# Small wait to ensure ports are released
sleep 1

# 2. Start Supervisor (Manages Backend, Price Server, Outrider, AND Frontend)
# Note: supervisor.py already includes the frontend in its SERVICES list
nohup python3 -u backend/supervisor.py > supervisor.log 2>&1 &
echo "✅ TACTIX Supervisor started (managing all services)."

echo "🚀 TACTIX Robust Stack Online."
