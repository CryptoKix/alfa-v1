import sys
import os

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from services.notifications import notify_trade

print("Sending test trade notification...")
try:
    notify_trade(
        tx_type="BUY",
        input_sym="USDC",
        input_amt=100.0,
        output_sym="SOL",
        output_amt=0.75,
        price=133.33,
        source="Manual Test"
    )
    print("Notification sent successfully!")
except Exception as e:
    print(f"Failed to send notification: {e}")
