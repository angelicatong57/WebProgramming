const express = require('express');
const { param, query, validationResult } = require('express-validator');
const db = require('../utils/db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const router = express.Router();

async function attachItems(orderRows) {
    if (!orderRows.length) return orderRows;
    const ids = orderRows.map(o => Number(o.order_id));
    const placeholders = ids.map(() => '?').join(',');
    const items = await db.allAsync(
        `SELECT oi.order_id, oi.pid, oi.quantity, oi.unit_price, oi.line_total, p.name AS product_name
         FROM order_items oi
         LEFT JOIN products p ON p.pid = oi.pid
         WHERE oi.order_id IN (${placeholders})
         ORDER BY oi.id ASC`,
        ids
    );
    const grouped = new Map();
    items.forEach((item) => {
        const oid = Number(item.order_id);
        if (!grouped.has(oid)) grouped.set(oid, []);
        grouped.get(oid).push(item);
    });
    return orderRows.map(o => ({ ...o, items: grouped.get(Number(o.order_id)) || [] }));
}

router.get(
    '/:orderId/status',
    requireLogin,
    [param('orderId').isInt({ min: 1 })],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        try {
            const order = await db.getAsync(
                'SELECT order_id, userid, status, total_amount, currency, created_at FROM orders WHERE order_id = ?',
                [req.params.orderId]
            );
            if (!order) return res.status(404).json({ error: 'Order not found' });
            if (Number(order.userid) !== Number(req.session.user.userid) && req.session.user.is_admin !== 1) {
                return res.status(403).json({ error: 'Forbidden' });
            }
            return res.json(order);
        } catch (err) {
            console.error('Failed to load order status:', err);
            return res.status(500).json({ error: 'Failed to load order status' });
        }
    }
);

router.get(
    '/member/recent',
    requireLogin,
    [query('limit').optional().isInt({ min: 1, max: 20 })],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        try {
            const limit = Number(req.query.limit || 5);
            const orders = await db.allAsync(
                `SELECT order_id, status, total_amount, currency, created_at
                 FROM orders
                 WHERE userid = ?
                 ORDER BY created_at DESC
                 LIMIT ?`,
                [req.session.user.userid, limit]
            );
            const withItems = await attachItems(orders);
            return res.json(withItems);
        } catch (err) {
            console.error('Failed to load recent orders:', err);
            return res.status(500).json({ error: 'Failed to load recent orders' });
        }
    }
);

router.get(
    '/admin/list',
    requireAdmin,
    [query('status').optional().isString(), query('limit').optional().isInt({ min: 1, max: 100 })],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        try {
            const status = req.query.status ? String(req.query.status) : null;
            const limit = Number(req.query.limit || 50);
            const where = status ? 'WHERE status = ?' : '';
            const params = status ? [status, limit] : [limit];
            const orders = await db.allAsync(
                `SELECT order_id, userid, username, status, currency, total_amount, stripe_session_id, stripe_payment_intent_id, created_at
                 FROM orders
                 ${where}
                 ORDER BY created_at DESC
                 LIMIT ?`,
                params
            );
            const withItems = await attachItems(orders);
            return res.json(withItems);
        } catch (err) {
            console.error('Failed to load admin orders:', err);
            return res.status(500).json({ error: 'Failed to load admin orders' });
        }
    }
);

module.exports = router;
