#!/usr/bin/env python3
"""News aggregation service for Tactix Intel using RSS and API sources."""
import requests
import time
import threading
import logging
import hashlib
import xml.etree.ElementTree as ET
from datetime import datetime
from extensions import db, socketio

logger = logging.getLogger("news_service")
logger.setLevel(logging.INFO)

class NewsService:
    def __init__(self):
        self._running = False
        self._thread = None
        self.seen_ids = set()
        self.news_cache = []
        self.sources = [
            {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/"},
            {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss"},
            {"name": "Decrypt", "url": "https://decrypt.co/feed"},
            {"name": "The Block", "url": "https://www.theblock.co/rss.xml"},
            {"name": "CryptoSlate", "url": "https://cryptoslate.com/feed/"}
        ]

    def start(self):
        if self._running: return
        print("📰 Intel: Initializing news cache...")
        self.aggregate_news()
        self._running = True
        self._thread = threading.Thread(target=self._main_loop, daemon=True)
        self._thread.start()
        print("📰 Intel News Service Started (Hybrid RSS/API)")

    def _main_loop(self):
        while self._running:
            try:
                self.aggregate_news()
                time.sleep(300)
            except Exception as e:
                logger.error(f"News Fetch Error: {e}")
                time.sleep(60)

    def aggregate_news(self):
        """Fetch and aggregate news from multiple sources."""
        new_items = []
        active_symbols = set(['SOL', 'AVICI', 'JUP', 'USDC'])
        try:
            bots = db.get_all_bots()
            for b in bots:
                sym = b.get('output_symbol', '').upper()
                if sym: active_symbols.add(sym)
        except: pass

        # 1. RSS Fetching
        for source in self.sources:
            try:
                headers = {'User-Agent': 'Mozilla/5.0'}
                response = requests.get(source['url'], headers=headers, timeout=15)
                if response.status_code != 200: continue
                root = ET.fromstring(response.content)
                for item in root.findall('.//item'):
                    title = item.find('title').text if item.find('title') is not None else ""
                    if not title: continue
                    link = item.find('link').text if item.find('link') is not None else ""
                    item_id = hashlib.md5((link or title).encode()).hexdigest()[:12]
                    if item_id in self.seen_ids: continue
                    self.seen_ids.add(item_id)
                    
                    lower_title = title.lower()
                    sentiment = "neutral"
                    if any(w in lower_title for w in ["surge", "rally", "jump", "ath"]): sentiment = "bullish"
                    if any(w in lower_title for w in ["crash", "drop", "sink", "low"]): sentiment = "bearish"
                    
                    news_data = {
                        "id": item_id,
                        "title": title,
                        "url": link,
                        "source": source['name'],
                        "type": "news",
                        "published_at": item.find('pubDate').text if item.find('pubDate') is not None else "",
                        "sentiment": sentiment,
                        "is_relevant": any(sym in title.upper() for sym in active_symbols if len(sym) >= 3)
                    }
                    new_items.append(news_data)
            except: pass

        # 2. Social Aggregator (Reddit - High Signal Social)
        try:
            # User-Agent is required for Reddit API
            headers = {'User-Agent': 'TactixTerminal/1.0'}
            reddit_url = "https://www.reddit.com/r/CryptoCurrency/hot.json?limit=25"
            res = requests.get(reddit_url, headers=headers, timeout=10).json()
            
            for post in res.get('data', {}).get('children', []):
                data = post.get('data', {})
                item_id = f"rd_{data.get('id')}"
                if item_id in self.seen_ids: continue
                self.seen_ids.add(item_id)
                
                title = data.get('title', '')
                is_relevant = any(sym in title.upper() for sym in active_symbols if len(sym) >= 3)
                
                new_items.append({
                    "id": item_id,
                    "title": title,
                    "url": f"https://reddit.com{data.get('permalink')}",
                    "source": f"Reddit / r/{data.get('subreddit')}",
                    "type": "social",
                    "published_at": datetime.fromtimestamp(data.get('created_utc')).isoformat() if data.get('created_utc') else "",
                    "sentiment": "bullish" if data.get('ups', 0) > 100 else "neutral",
                    "is_relevant": is_relevant
                })
        except Exception as e:
            logger.error(f"Reddit Social Fetch Error: {e}")

        if new_items:
            # Reverse ensures that we mix different sources when slicing
            new_items.reverse() 
            self.news_cache = (new_items + self.news_cache)[:100]
            
            socketio.emit('news_update', {"news": self.news_cache}, namespace='/intel')
            logger.info(f"📰 Intel: Discovered {len(new_items)} new signals")

# Global Instance
news_service = NewsService()
