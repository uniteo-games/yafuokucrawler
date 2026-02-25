# Yahoo Auctions Closed Search Actor

Apify Actor (Node.js + Crawlee + CheerioCrawler) to scrape closed auction data from Yahoo! Auctions Japan.

## Input
- `keyword` (string, required)
- `maxItems` (number, optional, default: 100)

## Output fields
- `title`
- `price` (numeric)
- `bids`
- `endTime`
- `itemUrl`
- `imageUrl`
- `sellerId`

## Run
```bash
npm install
npm start
```
