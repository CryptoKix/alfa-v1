#!/bin/bash

# TACTIX Service Manager
# Used by Gemini to ensure backend changes take effect immediately.

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔄 Restarting TACTIX Services in $SCRIPT_DIR..."

# 1. Kill existing instances (Aggressive)
# Kill standard and unbuffered variants
pkill -9 -f "python3 app.py"
pkill -9 -f "python3 -u app.py"
pkill -9 -f "python3 price_server.py"
pkill -9 -f "python3 -u price_server.py"

# Small wait to ensure ports are released
sleep 2

# 2. Start Backend (Redirect to server.log)
nohup python3 -u app.py > server.log 2>&1 &
echo "✅ Backend (app.py) started in background."

# 3. Start Price Server (Redirect to price_server.log)
nohup python3 -u price_server.py > price_server.log 2>&1 &
echo "✅ Price Server (price_server.py) started in background."

echo "🚀 All services synchronized and online."
