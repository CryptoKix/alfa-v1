#!/bin/bash

# TACTIX Service Manager
# Used by Gemini to ensure backend changes take effect immediately.

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "🔄 Restarting TACTIX Services in $SCRIPT_DIR..."

# 1. Kill existing instances (Graceful first)
echo "🛑 Terminating existing services..."
pkill -f "python3 app.py"
pkill -f "python3 -u app.py"
pkill -f "python3 price_server.py"
pkill -f "python3 -u price_server.py"
pkill -f "python3 sniper_outrider.py"
pkill -f "python3 -u sniper_outrider.py"

# Small wait to allow graceful exit and Discord notifications
sleep 3

# Forced cleanup for any stubborn processes
pkill -9 -f "python3 app.py"
pkill -9 -f "python3 -u app.py"
pkill -9 -f "python3 price_server.py"
pkill -9 -f "python3 -u price_server.py"
pkill -9 -f "python3 sniper_outrider.py"
pkill -9 -f "python3 -u sniper_outrider.py"

# Small wait to ensure ports are released
sleep 2

# Clear outrider log to prevent reading old detections
> sniper_outrider.log

# 2. Start Backend (Redirect to server.log)
nohup python3 -u app.py > server.log 2>&1 &
echo "✅ Backend (app.py) started in background."

# 3. Start Price Server (Redirect to price_server.log)
nohup python3 -u price_server.py > price_server.log 2>&1 &
echo "✅ Price Server (price_server.py) started in background."

# 4. Start Sniper Outrider (Redirect to sniper_outrider.log)
nohup python3 -u sniper_outrider.py > sniper_outrider.log 2>&1 &
echo "✅ Sniper Outrider (sniper_outrider.py) started in background."

echo "🚀 All services synchronized and online."
