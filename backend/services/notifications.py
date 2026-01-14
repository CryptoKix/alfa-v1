#!/usr/bin/env python3
"""Discord notification service for TACTIX."""
import requests
import json
import time
from datetime import datetime
from config import DISCORD_WEBHOOK_URL

def send_discord_notification(title, message, color=0x00FFFF, fields=None):
    """Send a formatted embed to Discord via webhook."""
    if not DISCORD_WEBHOOK_URL:
        return

    embed = {
        "title": title,
        "description": message,
        "color": color,
        "timestamp": datetime.utcnow().isoformat(),
        "footer": {
            "text": "TacTix.sol System Core",
            "icon_url": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
        }
    }

    if fields:
        embed["fields"] = fields

    payload = {
        "username": "TacTix Monitor",
        "avatar_url": "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
        "embeds": [embed]
    }

    try:
        requests.post(DISCORD_WEBHOOK_URL, json=payload, timeout=10)
    except Exception as e:
        print(f"Failed to send Discord notification: {e}")

def notify_trade(tx_type, input_sym, input_amt, output_sym, output_amt, price, profit=None, signature=None, source="Manual"):
    """Specific formatter for trade notifications."""
    color = 0x00FFFF if tx_type == "BUY" else 0xFF0080
    title = f"🚀 {source.upper()} {tx_type}: {input_sym}/{output_sym}"
    
    message = f"**{tx_type}** execution via **{source}** completed successfully."
    
    fields = [
        {"name": "Input", "value": f"{input_amt:.4f} {input_sym}", "inline": True},
        {"name": "Output", "value": f"{output_amt:.4f} {output_sym}", "inline": True},
        {"name": "Price", "value": f"${price:.2f}", "inline": True}
    ]
    
    if profit is not None:
        fields.append({"name": "Profit", "value": f"${profit:.4f}", "inline": True})

    send_discord_notification(title, message, color=color, fields=fields)

def notify_bot_completion(bot_type, alias, total_pnl):
    """Notify when a bot strategy finishes."""
    title = f"🏁 STRATEGY COMPLETED: {alias}"
    message = f"The **{bot_type}** engine has reached its target and terminated."
    color = 0x9945FF # Purple
    
    fields = [
        {"name": "Strategy", "value": bot_type, "inline": True},
        {"name": "Total PnL", "value": f"${total_pnl:.2f}", "inline": True}
    ]
    
    send_discord_notification(title, message, color=color, fields=fields)
