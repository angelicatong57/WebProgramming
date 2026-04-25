const express = require('express');
const db = require('../utils/db');
const { requireLogin } = require('../middleware/auth');
const { computeOrderDigest } = require('../utils/digest');

const router = express.Router();

async function markOrderPaid(orderId, paymentIntentId, eventId, eventType, payload) {
    const order = await db.getAsync('SELECT * FROM orders WHERE order_id = ?', [orderId]);
    if (!order) throw new Error(`Order not found: ${orderId}`);

    const existing = await db.getAsync('SELECT id FROM payment_events WHERE event_id = ?', [eventId]);
    if (existing) return { alreadyProcessed: true, order };

    const items = await db.allAsync(
        'SELECT pid, quantity, unit_price AS unitPriceCents FROM order_items WHERE order_id = ?',
        [orderId]
    );
    const digest = computeOrderDigest({
        currency: order.currency,
        merchantEmail: order.merchant_email,
        salt: order.salt,
        items,
        totalAmountCents: Number(order.total_amount)
    });

    if (digest !== order.digest) {
        await db.runAsync(
            "UPDATE orders SET status = 'FAILED' WHERE order_id = ?",
            [orderId]
        );
        throw new Error('Digest validation failed');
    }

    await db.runAsync(
        `UPDATE orders
         SET status = 'PAID', stripe_payment_intent_id = COALESCE(?, stripe_payment_intent_id)
         WHERE order_id = ?`,
        [paymentIntentId || null, orderId]
    );

    await db.runAsync(
        'INSERT INTO payment_events (provider, event_id, event_type, order_id, payload_json) VALUES (?, ?, ?, ?, ?)',
        ['stripe', eventId, eventType, orderId, JSON.stringify(payload || {})]
    );

    return { alreadyProcessed: false };
}

async function stripeWebhookHandler(req, res) {
    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!stripeSecret || !webhookSecret) {
        return res.status(400).json({ error: 'Stripe webhook not configured' });
    }

    try {
        const Stripe = require('stripe');
        const stripe = new Stripe(stripeSecret);
        const sig = req.headers['stripe-signature'];
        const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const orderId = Number(session.metadata?.order_id || 0);
            if (orderId > 0) {
                await markOrderPaid(
                    orderId,
                    session.payment_intent || null,
                    event.id,
                    event.type,
                    event
                );
            }
        }
        return res.json({ received: true });
    } catch (err) {
        console.error('Stripe webhook error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
}

router.post('/mock/complete/:orderId', requireLogin, async (req, res) => {
    const orderId = Number(req.params.orderId);
    try {
        const order = await db.getAsync('SELECT * FROM orders WHERE order_id = ?', [orderId]);
        if (!order) return res.status(404).json({ error: 'Order not found' });
        if (Number(order.userid) !== Number(req.session.user.userid) && req.session.user.is_admin !== 1) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        await markOrderPaid(
            orderId,
            `mock_pi_${Date.now()}`,
            `mock_evt_${Date.now()}`,
            'mock.checkout.completed',
            { mock: true, orderId }
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('Mock payment completion failed:', err);
        return res.status(500).json({ error: 'Failed to complete mock payment' });
    }
});

module.exports = {
    router,
    stripeWebhookHandler
};
