import { Actor, log } from 'apify';
import { CheerioCrawler, RequestQueue } from 'crawlee';

const SEARCH_URL = 'https://auctions.yahoo.co.jp/closedsearch/closedsearch';

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const toNumber = (value) => {
    const numeric = normalizeText(value).replace(/[^0-9]/g, '');
    return numeric ? Number(numeric) : null;
};

const toAbsoluteUrl = (href, baseUrl) => {
    if (!href) return null;
    try {
        return new URL(href, baseUrl).href;
    } catch {
        return null;
    }
};

const collectCandidateElements = ($) => {
    const selectors = [
        'li[data-auction-id]',
        'li.Product',
        '.Product',
        '.SearchResult__item',
        'li[class*="Product"]',
    ];

    for (const selector of selectors) {
        const matched = $(selector);
        if (matched.length > 0) return matched;
    }

    return $('li');
};

const extractFromElement = ($, element, loadedUrl) => {
    const $item = $(element);

    const linkEl = $item.find('a[href*="/auction/"]').first().length
        ? $item.find('a[href*="/auction/"]').first()
        : $item.find('a').first();

    const rawItemUrl = linkEl.attr('href');
    const itemUrl = toAbsoluteUrl(rawItemUrl, loadedUrl);
    const title = normalizeText(
        $item.find('[class*="title" i], h3, h2').first().text() || linkEl.text(),
    );

    if (!itemUrl || !title || !/\/auction\//.test(itemUrl)) return null;

    const imageEl = $item.find('img').first();
    const imageUrl = toAbsoluteUrl(imageEl.attr('data-src') || imageEl.attr('src'), loadedUrl);

    const price = toNumber(
        $item.find('[class*="price" i], [data-testid*="price" i]').first().text(),
    );

    const bids = toNumber(
        $item.find('[class*="bid" i], [data-testid*="bid" i]').first().text(),
    );

    const endTime = normalizeText(
        $item.find('time, [class*="time" i], [class*="date" i], [class*="end" i]').first().text(),
    ) || null;

    const sellerId = normalizeText(
        $item.find('[class*="seller" i] a, a[href*="/user/"]').first().text(),
    ) || null;

    return {
        title,
        price,
        bids,
        endTime,
        itemUrl,
        imageUrl,
        sellerId,
    };
};

const extractFromJsonLd = ($, loadedUrl) => {
    const items = [];

    $('script[type="application/ld+json"]').each((_, element) => {
        const raw = $(element).contents().text();
        if (!raw) return;

        try {
            const parsed = JSON.parse(raw);
            const data = Array.isArray(parsed) ? parsed : [parsed];

            for (const entry of data) {
                const candidates = entry?.itemListElement || entry?.mainEntity?.itemListElement;
                if (!Array.isArray(candidates)) continue;

                for (const node of candidates) {
                    const item = node?.item ?? node;
                    const offer = Array.isArray(item?.offers) ? item.offers[0] : item?.offers;
                    const url = toAbsoluteUrl(item?.url, loadedUrl);
                    if (!url || !/\/auction\//.test(url)) continue;

                    items.push({
                        title: normalizeText(item?.name),
                        price: toNumber(offer?.price),
                        bids: toNumber(item?.additionalProperty?.find?.((p) => /bid/i.test(p?.name))?.value),
                        endTime: normalizeText(item?.endDate) || null,
                        itemUrl: url,
                        imageUrl: toAbsoluteUrl(Array.isArray(item?.image) ? item.image[0] : item?.image, loadedUrl),
                        sellerId: normalizeText(item?.seller?.name) || null,
                    });
                }
            }
        } catch {
            // Ignore malformed JSON-LD blocks.
        }
    });

    return items;
};

const getNextPageUrl = ($, loadedUrl) => {
    const candidates = [
        'a[rel="next"]',
        'a[aria-label="次へ"]',
        'a.Pager__link--next',
        'a[href*="b="]',
    ];

    for (const selector of candidates) {
        const href = $(selector).first().attr('href');
        const url = toAbsoluteUrl(href, loadedUrl);
        if (url) return url;
    }

    const textBased = $('a').filter((_, el) => normalizeText($(el).text()).includes('次へ')).first();
    return toAbsoluteUrl(textBased.attr('href'), loadedUrl);
};

await Actor.init();

try {
    const input = (await Actor.getInput()) ?? {};
    const keyword = typeof input.keyword === 'string' ? input.keyword.trim() : '';
    const maxItems = Number.isFinite(input.maxItems) && input.maxItems > 0 ? Math.floor(input.maxItems) : 100;

    if (!keyword) throw new Error('Input "keyword" is required.');

    let scrapedCount = 0;
    const seenItemUrls = new Set();

    const requestQueue = await RequestQueue.open();
    const startUrl = `${SEARCH_URL}?p=${encodeURIComponent(keyword)}&ei=UTF-8&auccat=0`;
    await requestQueue.addRequest({ url: startUrl, userData: { label: 'SEARCH' } });

    const crawler = new CheerioCrawler({
        requestQueue,
        maxRequestRetries: 3,
        requestHandlerTimeoutSecs: 90,
        async requestHandler({ $, request, crawler }) {
            if (request.userData.label !== 'SEARCH') return;

            const records = [];
            const pushRecord = (item) => {
                if (!item?.itemUrl || seenItemUrls.has(item.itemUrl)) return;
                if (scrapedCount + records.length >= maxItems) return;

                seenItemUrls.add(item.itemUrl);
                records.push(item);
            };

            for (const element of collectCandidateElements($).toArray()) {
                pushRecord(extractFromElement($, element, request.loadedUrl));
                if (scrapedCount + records.length >= maxItems) break;
            }

            if (records.length === 0) {
                for (const item of extractFromJsonLd($, request.loadedUrl)) {
                    pushRecord(item);
                    if (scrapedCount + records.length >= maxItems) break;
                }
            }

            if (records.length > 0) {
                await Actor.pushData(records);
                scrapedCount += records.length;
                log.info(`Scraped ${records.length} items from ${request.loadedUrl}. Total: ${scrapedCount}/${maxItems}`);
            } else {
                log.warning(`No parsable items found on: ${request.loadedUrl}`);
            }

            if (scrapedCount >= maxItems) {
                log.info(`Reached maxItems (${maxItems}). Stopping crawler.`);
                await crawler.autoscaledPool?.abort();
                return;
            }

            const nextPageUrl = getNextPageUrl($, request.loadedUrl);
            if (!nextPageUrl) {
                log.info(`No next page found at: ${request.loadedUrl}`);
                return;
            }

            await requestQueue.addRequest({
                url: nextPageUrl,
                uniqueKey: nextPageUrl,
                userData: { label: 'SEARCH' },
            });
        },
        async failedRequestHandler({ request, error }) {
            log.error(`Request failed after retries: ${request.url}`, { error: error?.message });
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
