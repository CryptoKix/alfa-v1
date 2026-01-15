#!/usr/bin/env python3
"""News aggregation service for Tactix Intel using RSS feeds."""
import requests
import time
import threading
import logging
import xml.etree.ElementTree as ET
from datetime import datetime
from extensions import db, socketio

logger = logging.getLogger("news_service")
logger.setLevel(logging.INFO)

import hashlib

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
        
        # Populate cache synchronously for the first time so it's ready for immediate UI connections
        print("📰 Intel: Initializing news cache...")
        self.aggregate_news()
        
        self._running = True
        self._thread = threading.Thread(target=self._main_loop, daemon=True)
        self._thread.start()
        print("📰 Intel News Service Started (RSS Aggregator)")

    def _main_loop(self):
        while self._running:
            try:
                self.aggregate_news()
                # Poll every 5 minutes
                time.sleep(300)
            except Exception as e:
                logger.error(f"News Fetch Error: {e}")
                time.sleep(60)

    def aggregate_news(self):
        """Fetch and aggregate news from multiple RSS sources."""
        new_items = []
        
        # Fetch active symbols from DB to tag important news
        active_symbols = set(['SOL', 'AVICI', 'JUP', 'USDC']) # Pre-populate with majors
        try:
            bots = db.get_all_bots()
            for b in bots:
                sym = b.get('output_symbol', '').upper()
                if sym: active_symbols.add(sym)
        except: pass

        for source in self.sources:
            try:
                headers = {'User-Agent': 'Mozilla/5.0'}
                response = requests.get(source['url'], headers=headers, timeout=15)
                if response.status_code != 200: continue

                root = ET.fromstring(response.content)
                items = root.findall('.//item')

                for item in items:
                    title = item.find('title').text if item.find('title') is not None else ""
                    if not title: continue
                    
                    # Create stable ID from URL or title
                    link = item.find('link').text if item.find('link') is not None else ""
                    item_id = hashlib.md5((link or title).encode()).hexdigest()[:12]
                    
                    if item_id in self.seen_ids: continue
                    self.seen_ids.add(item_id)
                    
                    pub_date = item.find('pubDate').text if item.find('pubDate') is not None else ""
                    
                    # Sentiment Heuristic (Simple)
                    lower_title = title.lower()
                    sentiment = "neutral"
                    bullish_words = ["surge", "bull", "rally", "jump", "gain", "growth", "high", "new ath", "buy", "upbeat"]
                    bearish_words = ["crash", "drop", "dump", "fall", "sink", "low", "bear", "liquidated", "hacked", "scam"]
                    
                    if any(w in lower_title for w in bullish_words): sentiment = "bullish"
                    if any(w in lower_title for w in bearish_words): sentiment = "bearish"
                    if "urgent" in lower_title or "breaking" in lower_title or "alert" in lower_title: sentiment = "urgent"

                    # Relevance Check
                    is_relevant = any(sym in title.upper() for sym in active_symbols if len(sym) >= 3)

                    news_data = {
                        "id": item_id,
                        "title": title,
                        "url": link,
                        "source": source['name'],
                        "published_at": pub_date,
                        "sentiment": sentiment,
                        "is_relevant": is_relevant,
                        "currencies": [] 
                    }
                    new_items.append(news_data)

            except Exception as e:
                logger.error(f"Failed to fetch RSS from {source['name']}: {e}")

        if new_items:
            # Newest first
            self.news_cache = (new_items + self.news_cache)[:50]
            socketio.emit('news_update', {"news": self.news_cache}, namespace='/intel')
            logger.info(f"📰 Intel: Aggregated {len(new_items)} new items from RSS")

# Global Instance
news_service = NewsService()