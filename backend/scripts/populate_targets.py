import requests
import json

BASE_URL = "http://localhost:5001/api/copytrade/targets/add"

targets = [
    {
        "address": "9Qf7...EXAMPLE...WALLET...1", 
        "alias": "Citadel Wallet",
        "config": {
            "scale_factor": 0.5,
            "max_per_trade": 5.0,
            "auto_execute": True,
            "slippage": 1.0,
            "priority_fee": 0.01
        }
    },
    {
        "address": "H3CcASXoqwgANwqbqFzLATCzKT2M59LcDMSE1KfVuVUG",
        "alias": "Avici Accumulator",
        "config": {
            "scale_factor": 0.1,
            "max_per_trade": 1.0,
            "auto_execute": True,
            "slippage": 0.5,
            "priority_fee": 0.005
        }
    },
    {
        "address": "6Dz21CzQg9Lr8ffrWehvTWnFo2VcDsyew5fLWwC3CMpv",
        "alias": "Whale 42-18",
        "config": {
            "scale_factor": 0.2,
            "max_per_trade": 2.0,
            "auto_execute": False
        }
    },
    {
        "address": "ATiFipBzC4NWJ1YZkB5UfdCnwA1r6mSDtWtVpmPuKW5c",
        "alias": "Alpha Sniper",
        "config": {
            "scale_factor": 0.05,
            "max_per_trade": 0.5,
            "pump_scale": 0.1,
            "pump_max": 0.5,
            "auto_execute": True
        }
    }
]

for t in targets:
    try:
        # First add the target
        res = requests.post(BASE_URL, json={"address": t['address'], "alias": t['alias']})
        print(f"Added {t['alias']}: {res.status_code}")
        
        # Then update its config
        if res.status_code == 200:
            requests.post("http://localhost:5001/api/copytrade/targets/update", json={
                "address": t['address'],
                "config": t['config']
            })
            print(f"Updated config for {t['alias']}")
            
    except Exception as e:
        print(f"Failed to add {t['alias']}: {e}")
