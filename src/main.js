import { Actor, log } from 'apify';
import { CheerioCrawler, RequestQueue } from 'crawlee';

const SEARCH_URL = 'https://auctions.yahoo.co.jp/closedsearch/closedsearch';

const toNumber = (value) => {
    if (!value) return null;
    const numeric = String(value).replace(/[^0-9]/g, '');
    return numeric ? Number(numeric) : null;
};

const getText = ($el) => ($el?.text() || '').replace(/\s+/g, ' ').trim();

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
    const maxItems = Number.isFinite(input.maxItems) && input.maxItems > 0 ? Math.floor(input.maxItems) : 100;

    if (!keyword) {
        throw new Error('Input "keyword" is required.');
    }

    let scrapedCount = 0;

    const requestQueue = await RequestQueue.open();
    const startUrl = `${SEARCH_URL}?p=${encodeURIComponent(keyword)}&ei=UTF-8&auccat=0`;
    await requestQueue.addRequest({ url: startUrl, userData: { label: 'SEARCH' } });

    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 2,
        requestHandlerTimeoutSecs: 60,
        async requestHandler({ $, request, enqueueLinks, crawler }) {
            if (request.userData.label !== 'SEARCH') return;

            const itemSelectors = [
                'li.Product',
                'li.Product__list',
                'li[data-auction-id]',
                '.Product__item',
                '.SearchResult__item',
            ];

            const $items = $(itemSelectors.join(','));
            const results = [];

            $items.each((_, el) => {
                if (scrapedCount + results.length >= maxItems) return false;

                const $item = $(el);
                const title = getText($item.find('a.Product__titleLink, a.Product__title, h3 a').first());
                const priceText = getText($item.find('.Product__priceValue, .Product__price, [class*="Price"]').first());
                const bidsText = getText($item.find('.Product__bid, .Product__bids, [class*="Bid"]').first());
                const endTime = getText($item.find('.Product__time, .Product__date, time').first());
                const itemUrl =
                    $item.find('a.Product__titleLink, a.Product__title, h3 a').first().attr('href')
                    || $item.find('a').first().attr('href')
                    || null;
                const imageUrl =
                    $item.find('img').first().attr('data-src')
                    || $item.find('img').first().attr('src')
                    || null;
                const sellerId = getText($item.find('.Product__seller a, [class*="seller"] a, [class*="Seller"] a').first()) || null;

                if (!title || !itemUrl) return;

                results.push({
                    title,
                    price: toNumber(priceText),
                    bids: toNumber(bidsText),
                    endTime: endTime || null,
                    itemUrl: itemUrl.startsWith('http') ? itemUrl : new URL(itemUrl, request.loadedUrl).href,
                    imageUrl,
                    sellerId,
                });
            });

            if (results.length > 0) {
                await Actor.pushData(results);
                scrapedCount += results.length;
                log.info(`Scraped ${results.length} items from ${request.loadedUrl}. Total: ${scrapedCount}/${maxItems}`);
            } else {
                log.warning(`No items detected on page: ${request.loadedUrl}`);
            }

            if (scrapedCount >= maxItems) {
                log.info(`Reached maxItems (${maxItems}). Stopping crawler.`);
                await crawler.autoscaledPool?.abort();
                return;
            }

            await enqueueLinks({
                selector: 'a.Pager__link--next, a[aria-label="次へ"], a[rel="next"], a:contains("次へ")',
                label: 'SEARCH',
                strategy: 'same-domain',
                transformRequestFunction: (req) => {
                    req.userData = { label: 'SEARCH' };
                    return req;
                },
            });
        },
        async failedRequestHandler({ request, error }) {
            log.error(`Request failed after retries: ${request.url}`, { error: error.message });
        },
    });

    await crawler.run();
    log.info(`Crawler finished. Total scraped items: ${scrapedCount}`);
} catch (error) {
    log.exception(error, 'Actor failed');
    throw error;
} finally {
    await Actor.exit();
}
