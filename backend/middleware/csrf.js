const crypto = require('crypto');

function ensureCsrfToken(req) {
    if (!req.session) return null;
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
    const pathname = (req.originalUrl || req.url || '').split('?')[0] || '';
    if (!pathname.startsWith('/api/')) {
        return next();
    }

    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
        ensureCsrfToken(req);
        return next();
    }

    const sessionToken = ensureCsrfToken(req);
    const providedToken = req.get('x-csrf-token') || req.body?.csrfToken;

    if (!sessionToken || !providedToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    const a = Buffer.from(sessionToken);
    const b = Buffer.from(String(providedToken));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    return next();
}

module.exports = {
    ensureCsrfToken,
    csrfProtection
};
