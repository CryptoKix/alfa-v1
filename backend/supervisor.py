import time
import subprocess
import os
import sys
import signal
import threading

# Configuration
SERVICES = [
    {
        "name": "Backend",
        "command": ["python3", "-u", "backend/app.py"],
        "log": "backend/server.log",
        "cwd": ".",
        "restart_delay": 2
    },
    {
        "name": "Price Server",
        "command": ["python3", "-u", "backend/price_server.py"],
        "log": "backend/price_server.log",
        "cwd": ".",
        "restart_delay": 2
    },
    {
        "name": "Sniper Outrider",
        "command": ["python3", "-u", "backend/sniper_outrider.py"],
        "log": "backend/sniper_outrider.log",
        "cwd": ".",
        "restart_delay": 2
    },
    {
        "name": "Meteora Sidecar",
        "command": ["npm", "start"],
        "log": "backend/meteora_sidecar.log",
        "cwd": "backend/meteora_sidecar",
        "restart_delay": 3
    },
    {
        "name": "Kamino Sidecar",
        "command": ["npm", "start"],
        "log": "backend/kamino_sidecar.log",
        "cwd": "backend/kamino_sidecar",
        "restart_delay": 3
    },
    {
        "name": "Frontend",
        "command": ["npm", "run", "dev"],
        "log": "frontend/frontend.log",
        "cwd": "frontend",
        "restart_delay": 5
    },
    {
        "name": "Network Monitor",
        "command": ["python3", "-u", "backend/network_monitor.py"],
        "log": "backend/logs/network_monitor.log",
        "cwd": ".",
        "restart_delay": 5
    }
]

processes = {}
running = True

def log(message):
    print(f"[SUPERVISOR] {message}")

def tail_file(filename, n=10):
    try:
        with open(filename, 'r') as f:
            lines = f.readlines()
            return "".join(lines[-n:])
    except:
        return ""

def run_service(service):
    name = service['name']
    cmd = service['command']
    log_file = service['log']
    cwd = service['cwd']
    delay = service['restart_delay']

    while running:
        log(f"Starting {name}...")
        
        try:
            with open(log_file, 'a') as f_out:
                p = subprocess.Popen(
                    cmd,
                    stdout=f_out,
                    stderr=subprocess.STDOUT,
                    cwd=cwd,
                    preexec_fn=os.setsid # Create new process group
                )
                processes[name] = p
                
                # Wait for process to exit
                p.wait()
                
                code = p.returncode
                log(f"⚠️ {name} exited with code {code}")
                
                # If exit code is 0 and we are stopping, break
                if not running:
                    break
                    
                # If it crashed, wait and restart
                log(f"Restarting {name} in {delay}s...")
                time.sleep(delay)
                
        except Exception as e:
            log(f"❌ Error running {name}: {e}")
            time.sleep(delay)

def signal_handler(sig, frame):
    global running
    log("🛑 Shutting down supervisor...")
    running = False
    
    # Kill all children
    for name, p in processes.items():
        if p.poll() is None:
            log(f"Killing {name} (PID {p.pid})...")
            try:
                os.killpg(os.getpgid(p.pid), signal.SIGTERM)
            except:
                pass
    sys.exit(0)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    threads = []
    for service in SERVICES:
        t = threading.Thread(target=run_service, args=(service,))
        t.daemon = True
        t.start()
        threads.append(t)
        
    # Main thread wait
    while running:
        time.sleep(1)
