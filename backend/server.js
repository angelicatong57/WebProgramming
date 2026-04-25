require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const { csrfProtection } = require('./middleware/csrf');
const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

if (isProduction) {
    const secret = process.env.SESSION_SECRET;
    if (!secret || secret === 'replace_this_with_a_long_random_secret') {
        console.error('FATAL: Set SESSION_SECRET in production (long random string).');
        process.exit(1);
    }
}

// Behind Nginx TLS termination: trust X-Forwarded-* so req.secure / cookies behave correctly.
app.set('trust proxy', 1);

// Persist sessions on disk so CSRF + login work when multiple Node workers (e.g. PM2 cluster) or restarts.
const sessionsDir = path.join(__dirname, '../sessions');
fs.mkdirSync(sessionsDir, { recursive: true });
const sessionMaxAgeMs = 2 * 24 * 60 * 60 * 1000;

const checkoutRouter = require('./routes/checkout');
const ordersRouter = require('./routes/orders');
const payments = require('./routes/payments');

// Stripe needs raw body for webhook signature verification.
app.post('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }), payments.stripeWebhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    store: new FileStore({
        path: sessionsDir,
        ttl: Math.floor(sessionMaxAgeMs / 1000),
        reapInterval: 3600,
        retries: 15,
    }),
    name: 'auth_token',
    secret: process.env.SESSION_SECRET || 'replace_this_with_a_long_random_secret',
    resave: false,
    saveUninitialized: false,
    proxy: true,
    cookie: {
        httpOnly: true,
        // With trust proxy + X-Forwarded-Proto from Nginx, 'auto' sends Secure cookies on HTTPS only.
        secure: isProduction ? 'auto' : false,
        sameSite: 'lax',
        maxAge: sessionMaxAgeMs,
    },
}));

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
app.use(csrfProtection);

// Import routes
const productsRouter = require('./routes/products');
const categoriesRouter = require('./routes/categories');
const authRouter = require('./routes/auth');

// Register routes
app.use('/api/auth', authRouter);
app.use('/api/products', productsRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/checkout', checkoutRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/payments', payments.router);
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Legacy URLs (old /pages/ location)
const redirectWithQuery = (targetBase) => (req, res) => {
    const q = req.url.indexOf('?') >= 0 ? req.url.slice(req.url.indexOf('?')) : '';
    res.redirect(301, targetBase + q);
};
app.get('/pages/home.html', redirectWithQuery('/home.html'));
app.get('/pages/product.html', redirectWithQuery('/product.html'));

app.get('/pages/admin.html', (req, res) => {
    if (!req.session || !req.session.user || req.session.user.is_admin !== 1) {
        return res.redirect('/login.html');
    }
    return res.redirect('/admin');
});

app.get('/admin', (req, res) => {
    if (!req.session || !req.session.user || req.session.user.is_admin !== 1) {
        return res.redirect('/login.html');
    }
    res.sendFile(path.join(__dirname, '../frontend/admin.html'));
});

function sendLoginPage(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/login.html'));
}

function sendRegisterPage(req, res) {
    res.sendFile(path.join(__dirname, '../frontend/register.html'));
}

function sendChangePasswordPage(req, res) {
    if (!req.session || !req.session.user) {
        return res.redirect('/login.html');
    }
    return res.sendFile(path.join(__dirname, '../frontend/change-password.html'));
}

app.get('/login', sendLoginPage);
app.get('/login.html', sendLoginPage);

app.get('/register', sendRegisterPage);
app.get('/register.html', sendRegisterPage);
app.get('/payment-success', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/payment-success.html'));
});
app.get('/payment-success.html', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/payment-success.html'));
});

app.get('/change-password', sendChangePasswordPage);
/* Must be before express.static so unauthenticated users cannot read the HTML without a session */
app.get('/change-password.html', sendChangePasswordPage);

app.use(express.static(path.join(__dirname, '../frontend')));

// Root route - redirect to frontend product list
app.get('/', (req, res) => {
    res.redirect('/home.html');
});

app.use((req, res) => {
    res.status(404).type('html').send(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title></head><body>' +
        '<p>Page not found.</p><p><a href="/home.html">Home</a></p></body></html>'
    );
});

// Error handler middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err.stack);
    
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large, must be <= 10MB' });
    }
    if (err.message && err.message.includes('Only JPG')) { // error from upload middleware
        return res.status(400).json({ error: err.message });
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

// Start server (use HOST=127.0.0.1 in production so only Nginx on the same machine can reach Node)
app.listen(port, host, () => {
    console.log(`=================================`);
    console.log(`Server started on http://${host}:${port}`);
    if (isProduction) {
        console.log('NODE_ENV=production (Secure session cookies enabled — use HTTPS in front, e.g. Nginx).');
    }
    console.log(`=================================`);
});