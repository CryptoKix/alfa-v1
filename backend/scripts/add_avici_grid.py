import requests
import json

API_URL = "http://localhost:5001/api/dca/add"

# AVICI Mint: BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta
# USDC Mint: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

# Current Price: ~$4.76
# We'll set a 10-level grid between $4.00 and $5.50

payload = {
    "alias": "AVICI Accumulator Grid",
    "strategy": "GRID",
    "inputMint": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", # USDC
    "outputMint": "BANKJmvhT8tiJRsBSS1n2HryMBPvT5Ze4HU95DUAmeta", # AVICI
    "lowerBound": 4.00,
    "upperBound": 5.50,
    "steps": 10,
    "totalInvestment": 100.0, # $100 total
    "amount": 10.0 # Just a placeholder for DCA-style amount if needed
}

try:
    res = requests.post(API_URL, json=payload)
    if res.status_code == 200:
        print(f"✅ Grid Bot Added Successfully: {res.json()}")
    else:
        print(f"❌ Failed to add bot: {res.status_code} - {res.text}")
except Exception as e:
    print(f"❌ Error adding bot: {e}")
