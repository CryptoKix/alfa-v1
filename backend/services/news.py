#!/usr/bin/env python3
"""News aggregation service for Tactix Intel using RSS and API sources."""
import requests
import time
import threading
import logging
import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import datetime
import sio_bridge
from extensions import db

logger = logging.getLogger("news_service")
logger.setLevel(logging.INFO)

# Noise words to filter out from ticker extraction
TICKER_NOISE_WORDS = {
    'THE', 'AND', 'FOR', 'ARE', 'BUT', 'NOT', 'YOU', 'ALL', 'CAN', 'HAD',
    'HER', 'WAS', 'ONE', 'OUR', 'OUT', 'HAS', 'HIS', 'HOW', 'ITS', 'MAY',
    'NEW', 'NOW', 'OLD', 'SEE', 'TWO', 'WAY', 'WHO', 'BOY', 'DID', 'GET',
    'LET', 'PUT', 'SAY', 'SHE', 'TOO', 'USE', 'CEO', 'CFO', 'IPO', 'ETF',
    'GDP', 'CPI', 'FED', 'SEC', 'DOJ', 'FBI', 'USA', 'USD', 'EUR', 'GBP',
    'JPY', 'CNY', 'BTC', 'ETH', 'SOL', 'TOP', 'BIG', 'LOW', 'HIGH', 'JUST'
}

class NewsService:
    def __init__(self):
        self._running = False
        self._thread = None
        self.seen_ids = set()
        self.news_cache = []

        # Crypto RSS Sources
        self.crypto_sources = [
            {"name": "CoinDesk", "url": "https://www.coindesk.com/arc/outboundfeeds/rss/", "category": "crypto"},
            {"name": "CoinTelegraph", "url": "https://cointelegraph.com/rss", "category": "crypto"},
            {"name": "Decrypt", "url": "https://decrypt.co/feed", "category": "crypto"},
            {"name": "The Block", "url": "https://www.theblock.co/rss.xml", "category": "crypto"},
            {"name": "CryptoSlate", "url": "https://cryptoslate.com/feed/", "category": "crypto"}
        ]

        # TradFi RSS Sources
        self.tradfi_sources = [
            {"name": "Yahoo Finance", "url": "https://finance.yahoo.com/rss/topfinstories", "category": "stocks"},
            {"name": "MarketWatch", "url": "https://feeds.marketwatch.com/marketwatch/topstories/", "category": "stocks"},
            {"name": "CNBC Markets", "url": "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258", "category": "stocks"},
            {"name": "FX Street", "url": "https://www.fxstreet.com/rss/news", "category": "forex"},
            {"name": "Investing.com", "url": "https://www.investing.com/rss/news.rss", "category": "macro"},
        ]

        # Combined sources
        self.sources = self.crypto_sources + self.tradfi_sources

        # Crypto Reddit Sources
        self.crypto_reddit = [
            {"name": "r/CryptoCurrency", "subreddit": "CryptoCurrency", "category": "crypto"},
        ]

        # TradFi Reddit Sources
        self.tradfi_reddit = [
            {"name": "r/stocks", "subreddit": "stocks", "category": "stocks"},
            {"name": "r/wallstreetbets", "subreddit": "wallstreetbets", "category": "stocks"},
            {"name": "r/investing", "subreddit": "investing", "category": "macro"},
        ]

        # Combined Reddit sources
        self.reddit_sources = self.crypto_reddit + self.tradfi_reddit

        # Sentiment keywords
        self.bullish_keywords = [
            "surge", "rally", "jump", "ath", "soar", "gain", "bull", "moon", "pump",
            "beat", "upgrade", "earnings beat", "rate cut", "stimulus", "growth"
        ]
        self.bearish_keywords = [
            "crash", "drop", "sink", "low", "plunge", "dump", "bear", "fall", "tumble",
            "miss", "downgrade", "layoffs", "rate hike", "recession", "default", "bankruptcy"
        ]
        self.urgent_keywords = [
            "breaking", "flash", "just in", "alert", "urgent", "exclusive"
        ]

    def start(self):
        if self._running: return
        print("📰 Intel: Initializing news cache...")
        self.aggregate_news()
        self._running = True
        self._thread = threading.Thread(target=self._main_loop, daemon=True)
        self._thread.start()
        print("📰 Intel News Service Started (Hybrid RSS/API)")

    def stop(self):
        self._running = False
        self._thread = None
        print("📰 Intel News Service Stopped")

    def is_running(self):
        return self._running

    def _main_loop(self):
        while self._running:
            try:
                self.aggregate_news()
                time.sleep(300)
            except Exception as e:
                logger.error(f"News Fetch Error: {e}")
                time.sleep(60)

    def _analyze_sentiment(self, title: str) -> str:
        """Analyze sentiment from title text."""
        lower_title = title.lower()

        # Check urgent first (highest priority)
        if any(w in lower_title for w in self.urgent_keywords):
            return "urgent"

        # Check bullish/bearish
        if any(w in lower_title for w in self.bullish_keywords):
            return "bullish"
        if any(w in lower_title for w in self.bearish_keywords):
            return "bearish"

        return "neutral"

    def _extract_tickers(self, title: str) -> list:
        """Extract stock tickers ($AAPL format) from title."""
        # Match $TICKER patterns (1-5 uppercase letters)
        matches = re.findall(r'\$([A-Z]{1,5})\b', title.upper())
        # Filter noise words
        tickers = [t for t in matches if t not in TICKER_NOISE_WORDS]
        return list(set(tickers))[:5]  # Dedupe and limit to 5

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

        # 1. RSS Fetching (Crypto + TradFi)
        for source in self.sources:
            try:
                headers = {'User-Agent': 'Mozilla/5.0 (compatible; TactixBot/1.0)'}
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

                    category = source.get('category', 'crypto')
                    sentiment = self._analyze_sentiment(title)

                    news_data = {
                        "id": item_id,
                        "title": title,
                        "url": link,
                        "source": source['name'],
                        "type": "news",
                        "category": category,
                        "published_at": item.find('pubDate').text if item.find('pubDate') is not None else "",
                        "sentiment": sentiment,
                        "is_relevant": any(sym in title.upper() for sym in active_symbols if len(sym) >= 3)
                    }

                    # Extract tickers for stock news
                    if category == 'stocks':
                        tickers = self._extract_tickers(title)
                        if tickers:
                            news_data["tickers"] = tickers

                    new_items.append(news_data)
            except Exception as e:
                logger.debug(f"RSS Fetch Error for {source.get('name')}: {e}")

        # 2. Social Aggregator (Reddit - Crypto + TradFi)
        for reddit_source in self.reddit_sources:
            try:
                headers = {'User-Agent': 'TactixTerminal/1.0'}
                reddit_url = f"https://www.reddit.com/r/{reddit_source['subreddit']}/hot.json?limit=15"
                res = requests.get(reddit_url, headers=headers, timeout=10).json()

                for post in res.get('data', {}).get('children', []):
                    data = post.get('data', {})
                    item_id = f"rd_{data.get('id')}"
                    if item_id in self.seen_ids: continue
                    self.seen_ids.add(item_id)

                    title = data.get('title', '')
                    is_relevant = any(sym in title.upper() for sym in active_symbols if len(sym) >= 3)
                    category = reddit_source.get('category', 'crypto')
                    sentiment = self._analyze_sentiment(title)

                    # Boost sentiment for highly upvoted posts
                    if data.get('ups', 0) > 500 and sentiment == "neutral":
                        sentiment = "bullish"

                    news_item = {
                        "id": item_id,
                        "title": title,
                        "url": f"https://reddit.com{data.get('permalink')}",
                        "source": f"Reddit / r/{data.get('subreddit')}",
                        "type": "social",
                        "category": category,
                        "published_at": datetime.fromtimestamp(data.get('created_utc')).isoformat() if data.get('created_utc') else "",
                        "sentiment": sentiment,
                        "is_relevant": is_relevant
                    }

                    # Extract tickers for stocks subreddits
                    if category == 'stocks':
                        tickers = self._extract_tickers(title)
                        if tickers:
                            news_item["tickers"] = tickers

                    new_items.append(news_item)
            except Exception as e:
                logger.debug(f"Reddit Fetch Error for {reddit_source.get('name')}: {e}")

        if new_items:
            # Reverse ensures that we mix different sources when slicing
            new_items.reverse() 
            self.news_cache = (new_items + self.news_cache)[:100]
            
            sio_bridge.emit('news_update', {"news": self.news_cache}, namespace='/intel')
            logger.info(f"📰 Intel: Discovered {len(new_items)} new signals")

# Global Instance
news_service = NewsService()
