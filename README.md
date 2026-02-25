# Yahoo Auctions Japan - Sold Items Scraper

Scrape **sold/closed auction items** from Yahoo Auctions Japan (ヤフオク) using Node.js, Crawlee, and CheerioCrawler. Extract final prices, titles, bid counts, end times, and more — perfect for resellers, market researchers, and price analysts.

## 🔍 What does this Actor do?

This Actor searches Yahoo Auctions Japan's closed auction database and returns data on items that have **already sold**. Unlike scraping active listings, sold data gives you **real market prices** — what buyers actually paid.

## 💡 Why use sold item data?

- Active listings show **asking prices** — sold listings show **actual transaction prices**
- Essential for resellers to determine profitable buy prices
- Ideal for price trend analysis in Japanese e-commerce
- Used by market researchers tracking demand for specific products

## 📦 Output fields

Each result includes the following fields:

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | Product name / auction title |
| `price` | number | Final sold price (JPY) |
| `bids` | number | Number of bids received |
| `endTime` | string | Auction end date and time |
| `itemUrl` | string | Direct link to the auction page |
| `imageUrl` | string | Thumbnail image URL |
| `sellerStatus` | string | Seller listing status text (e.g. "出品中の商品") |

## ⚙️ Input

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyword` | string | ✅ Yes | — | Search keyword (Japanese or English) |
| `maxItems` | number | No | 100 | Maximum number of results to return |

### Example input

```json
{
  "keyword": "Nintendo Switch",
  "maxItems": 50
}
```

### Tips for better results

- Japanese keywords return more results than English (e.g. `ニンテンドースイッチ` vs `Nintendo Switch`)
- Use specific model names or product codes for precise pricing data
- Increase `maxItems` for broader market analysis

## 📊 Example output

```json
{
  "title": "Nintendo Switch スプラトゥーン2セット",
  "price": 6886,
  "bids": 40,
  "endTime": "02/24 23:02",
  "itemUrl": "https://auctions.yahoo.co.jp/jp/auction/v1220543806",
  "imageUrl": "https://auc-pctr.c.yimg.jp/...",
  "sellerStatus": "出品中の商品"
}
```

## 🎯 Use cases

- **Resellers**: Find the real market value of items before buying inventory
- **Price tracking**: Monitor how prices fluctuate over time for specific products
- **Market research**: Analyze demand trends for Japanese consumer goods
- **Investment**: Identify undervalued items by comparing active vs sold prices
- **E-commerce analytics**: Benchmark your pricing against actual market transactions

## 🚀 Getting started

1. Enter a search keyword (Japanese recommended)
2. Set `maxItems` (default: 100)
3. Run the Actor
4. Download results as JSON, CSV, or Excel

## 🛠️ Technical details

- Built with **Node.js**, **Crawlee**, and **CheerioCrawler**
- Supports automatic pagination
- Duplicate URL detection built-in
- Stops automatically when `maxItems` is reached
- Dual extraction strategy: DOM selectors + JSON-LD fallback for reliability

## ⚠️ Notes

- Data is sourced from Yahoo Auctions Japan's public closed search pages
- Results reflect auctions that have ended and completed
- Japanese keywords generally return more and better results
- `sellerStatus` contains the seller's listing status text as displayed on the page
