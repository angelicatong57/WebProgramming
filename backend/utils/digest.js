const crypto = require('crypto');

function toCents(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.round(n * 100);
}

function buildCanonicalOrderString({ currency, merchantEmail, salt, items, totalAmountCents }) {
    const normalized = [...items]
        .map(i => ({
            pid: Number(i.pid),
            quantity: Number(i.quantity),
            unitPriceCents: Number(i.unitPriceCents)
        }))
        .sort((a, b) => a.pid - b.pid);

    const parts = [
        String(currency || '').toUpperCase(),
        String(merchantEmail || ''),
        String(salt || '')
    ];

    normalized.forEach((i) => {
        parts.push(`${i.pid}:${i.quantity}:${i.unitPriceCents}`);
    });
    parts.push(String(totalAmountCents));
    return parts.join('|');
}

function computeOrderDigest(payload) {
    const secret = process.env.ORDER_DIGEST_SECRET || 'dev_order_digest_secret';
    const canonical = buildCanonicalOrderString(payload);
    return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

module.exports = {
    toCents,
    buildCanonicalOrderString,
    computeOrderDigest
};
