#!/bin/bash

# TACTIX Service Manager
# Used by Gemini to ensure backend changes take effect immediately.

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔄 Restarting TACTIX Services in $SCRIPT_DIR..."

# 1. Kill existing instances (Graceful first)
echo "🛑 Terminating existing services..."
pkill -f "python3 backend/supervisor.py"
pkill -f "python3 -u backend/app.py"
pkill -f "python3 price_server.py"
pkill -f "python3 sniper_outrider.py"
pkill -f "vite"

# Small wait to allow graceful exit
sleep 2

# Forced cleanup
pkill -9 -f "python3 backend/supervisor.py"
pkill -9 -f "python3 backend/app.py"
pkill -9 -f "python3 price_server.py"
pkill -9 -f "python3 sniper_outrider.py"
pkill -9 -f "vite"

# Small wait to ensure ports are released
sleep 1

# 2. Start Supervisor (Manages Backend, Price Server, Outrider)
nohup python3 -u backend/supervisor.py > backend/supervisor.log 2>&1 &
echo "✅ Backend Supervisor started."

# 3. Start Frontend
echo "⏳ Initializing Frontend..."
cd ../frontend
setsid nohup npm run dev > frontend.log 2>&1 < /dev/null &
echo "✅ Frontend (vite) started."

echo "🚀 TACTIX Robust Stack Online."
