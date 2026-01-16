#!/bin/bash

# TACTIX Service Manager
# Used by Gemini to ensure backend changes take effect immediately.

# Get the directory where the script is located and go to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( dirname "$SCRIPT_DIR" )"
cd "$PROJECT_ROOT"

echo "🔄 Restarting TACTIX Services in $PROJECT_ROOT..."

# 1. Kill existing instances (Graceful first)
echo "🛑 Terminating existing services..."
pkill -f "supervisor.py"
pkill -f "backend/app.py"
pkill -f "backend/price_server.py"
pkill -f "backend/sniper_outrider.py"
pkill -f "vite"

# Small wait to allow graceful exit
sleep 2

# Forced cleanup
pkill -9 -f "supervisor.py"
pkill -9 -f "backend/app.py"
pkill -9 -f "backend/price_server.py"
pkill -9 -f "backend/sniper_outrider.py"
pkill -9 -f "vite"

# Small wait to ensure ports are released
sleep 1

# 2. Start Supervisor (Manages Backend, Price Server, Outrider, and Frontend)
setsid nohup python3 -u backend/supervisor.py > backend/supervisor.log 2>&1 < /dev/null &
echo "✅ TACTIX Supervisor started (Managing all nodes)."

echo "🚀 TACTIX Robust Stack Online."
