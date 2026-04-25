const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const db = require('../utils/db');
const { requireLogin } = require('../middleware/auth');
const { toCents, computeOrderDigest } = require('../utils/digest');

const router = express.Router();

function getBaseUrl(req) {
    const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
    const host = req.get('x-forwarded-host') || req.get('host');
    return `${proto}://${host}`;
}

router.post(
    '/create',
    requireLogin,
    [
        body('currency').optional().isString(),
        body('items').isArray({ min: 1 }).withMessage('items must be a non-empty array'),
        body('items.*.pid').isInt({ min: 1 }).withMessage('pid must be a positive integer'),
        body('items.*.quantity').isInt({ min: 1 }).withMessage('quantity must be a positive integer')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

        const currency = String(req.body.currency || 'HKD').toUpperCase();
        const merchantEmail = process.env.PAYMENT_MERCHANT_EMAIL || process.env.PAYPAL_MERCHANT_EMAIL || 'merchant@example.com';

        try {
            const mergedMap = new Map();
            for (const row of req.body.items) {
                const pid = Number(row.pid);
                const quantity = Number(row.quantity);
                mergedMap.set(pid, (mergedMap.get(pid) || 0) + quantity);
            }
            const merged = [...mergedMap.entries()].map(([pid, quantity]) => ({ pid, quantity }));
            const pids = merged.map(i => i.pid);

            const placeholders = pids.map(() => '?').join(',');
            const products = await db.allAsync(
                `SELECT pid, name, price, storage FROM products WHERE pid IN (${placeholders})`,
                pids
            );

            if (products.length !== pids.length) {
                return res.status(400).json({ error: 'Some products no longer exist' });
            }

            const byPid = new Map(products.map(p => [Number(p.pid), p]));
            const itemsWithPrice = [];
            let totalAmountCents = 0;

            for (const reqItem of merged) {
                const product = byPid.get(reqItem.pid);
                if (!product) return res.status(400).json({ error: `Invalid product ${reqItem.pid}` });
                if (Number(reqItem.quantity) > Number(product.storage || 0)) {
                    return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
                }
                const unitPriceCents = toCents(product.price);
                const lineTotal = unitPriceCents * reqItem.quantity;
                totalAmountCents += lineTotal;
                itemsWithPrice.push({
                    pid: reqItem.pid,
                    quantity: reqItem.quantity,
                    unitPriceCents,
                    productName: String(product.name || `#${reqItem.pid}`)
                });
            }

            const salt = crypto.randomBytes(16).toString('hex');
            const digest = computeOrderDigest({
                currency,
                merchantEmail,
                salt,
                items: itemsWithPrice,
                totalAmountCents
            });

            const orderResult = await db.runAsync(
                `INSERT INTO orders (userid, username, currency, merchant_email, salt, digest, total_amount, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'CREATED')`,
                [
                    req.session.user.userid,
                    req.session.user.user_name || req.session.user.email || `user-${req.session.user.userid}`,
                    currency,
                    merchantEmail,
                    salt,
                    digest,
                    totalAmountCents
                ]
            );
            const orderId = orderResult.lastID;

            for (const item of itemsWithPrice) {
                await db.runAsync(
                    `INSERT INTO order_items (order_id, pid, quantity, unit_price, line_total)
                     VALUES (?, ?, ?, ?, ?)`,
                    [orderId, item.pid, item.quantity, item.unitPriceCents, item.unitPriceCents * item.quantity]
                );
            }

            const stripeSecret = process.env.STRIPE_SECRET_KEY;
            let checkoutUrl = `${getBaseUrl(req)}/payment-success.html?order_id=${encodeURIComponent(orderId)}&mock=1`;

            if (stripeSecret) {
                const Stripe = require('stripe');
                const stripe = new Stripe(stripeSecret);
                const baseUrl = getBaseUrl(req);
                const session = await stripe.checkout.sessions.create({
                    mode: 'payment',
                    success_url: `${baseUrl}/payment-success.html?order_id=${orderId}`,
                    cancel_url: `${baseUrl}/home.html?checkout=cancelled`,
                    payment_method_types: ['card'],
                    metadata: { order_id: String(orderId) },
                    line_items: itemsWithPrice.map(i => ({
                        quantity: i.quantity,
                        price_data: {
                            currency: currency.toLowerCase(),
                            unit_amount: i.unitPriceCents,
                            product_data: { name: i.productName }
                        }
                    }))
                });

                checkoutUrl = session.url;
                await db.runAsync('UPDATE orders SET stripe_session_id = ?, status = ? WHERE order_id = ?', [
                    session.id,
                    'PENDING',
                    orderId
                ]);
            } else {
                await db.runAsync("UPDATE orders SET status = 'PENDING' WHERE order_id = ?", [orderId]);
            }

            return res.json({
                orderId,
                digest,
                checkoutUrl
            });
        } catch (err) {
            console.error('Failed to create checkout order:', err);
            return res.status(500).json({ error: 'Failed to create checkout order' });
        }
    }
);

module.exports = router;
