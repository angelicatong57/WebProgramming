const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const db = require('../utils/db');
const { requireLogin } = require('../middleware/auth');
const { ensureCsrfToken } = require('../middleware/csrf');

const router = express.Router();

router.get('/csrf', (req, res) => {
    const csrfToken = ensureCsrfToken(req);
    return res.json({ csrfToken });
});

router.get('/me', (req, res) => {
    if (!req.session || !req.session.user) {
        return res.json({ authenticated: false, user: null });
    }
    return res.json({ authenticated: true, user: req.session.user });
});

router.post(
    '/register',
    [
        body('user_name')
            .trim()
            .notEmpty()
            .withMessage('User name is required')
            .isLength({ max: 100 })
            .withMessage('User name is too long'),
        body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
        body('password')
            .isLength({ min: 8 })
            .withMessage('Password must be at least 8 characters'),
        body('confirmPassword')
            .notEmpty()
            .withMessage('Please confirm your password')
    ],
    async (req, res) => {
        if (!req.body.user_name && req.body.userName) {
            req.body.user_name = req.body.userName;
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, confirmPassword } = req.body;
        const normalizedUserName = String(req.body.user_name || '').trim();
        if (!normalizedUserName) {
            return res.status(400).json({ error: 'User name is required' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match' });
        }

        try {
            const existing = await db.getAsync('SELECT userid FROM users WHERE email = ?', [email]);
            if (existing) {
                return res.status(409).json({ error: 'Email already exists' });
            }

            const passwordHash = await bcrypt.hash(password, 12);
            await db.runAsync(
                'INSERT INTO users (user_name, email, password_hash, is_admin) VALUES (?, ?, ?, ?)',
                [normalizedUserName, email, passwordHash, 0]
            );
            return res.status(201).json({ message: 'Registered successfully' });
        } catch (err) {
            console.error('Register failed:', err);
            return res.status(500).json({ error: 'Server error' });
        }
    }
);

router.post(
    '/login',
    [
        body('email').isEmail().withMessage('Please enter a valid email').normalizeEmail(),
        body('password').notEmpty().withMessage('Password is required')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password } = req.body;

        try {
            const user = await db.getAsync(
                'SELECT userid, user_name, email, password_hash, is_admin FROM users WHERE email = ?',
                [email]
            );
            if (!user) {
                return res.status(401).json({ error: 'Incorrect email or password' });
            }

            const ok = await bcrypt.compare(password, user.password_hash);
            if (!ok) {
                return res.status(401).json({ error: 'Incorrect email or password' });
            }

            req.session.regenerate((regenErr) => {
                if (regenErr) {
                    console.error('Session regenerate failed:', regenErr);
                    return res.status(500).json({ error: 'Server error' });
                }

                req.session.user = {
                    userid: user.userid,
                    user_name: user.user_name,
                    email: user.email,
                    is_admin: user.is_admin
                };

                return res.json({
                    message: 'Login successful',
                    user: req.session.user
                });
            });
        } catch (err) {
            console.error('Login failed:', err);
            return res.status(500).json({ error: 'Server error' });
        }
    }
);

router.post('/logout', (req, res) => {
    if (!req.session) {
        return res.json({ message: 'Logged out' });
    }

    req.session.destroy((err) => {
        if (err) {
            console.error('Logout failed:', err);
            return res.status(500).json({ error: 'Server error' });
        }
        res.clearCookie('auth_token');
        return res.json({ message: 'Logged out' });
    });
});

router.post(
    '/change-password',
    requireLogin,
    [
        body('currentPassword').notEmpty().withMessage('Current password is required'),
        body('newPassword')
            .isLength({ min: 8 })
            .withMessage('New password must be at least 8 characters'),
        body('confirmNewPassword')
            .notEmpty()
            .withMessage('Please confirm new password')
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { currentPassword, newPassword, confirmNewPassword } = req.body;
        if (newPassword !== confirmNewPassword) {
            return res.status(400).json({ error: 'New passwords do not match' });
        }

        if (currentPassword === newPassword) {
            return res.status(400).json({ error: 'New password must be different' });
        }

        try {
            const user = await db.getAsync(
                'SELECT userid, password_hash FROM users WHERE userid = ?',
                [req.session.user.userid]
            );
            if (!user) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const currentOk = await bcrypt.compare(currentPassword, user.password_hash);
            if (!currentOk) {
                return res.status(401).json({ error: 'Current password is incorrect' });
            }

            const newHash = await bcrypt.hash(newPassword, 12);
            await db.runAsync(
                'UPDATE users SET password_hash = ? WHERE userid = ?',
                [newHash, user.userid]
            );

            req.session.destroy((destroyErr) => {
                if (destroyErr) {
                    console.error('Session destroy after password change failed:', destroyErr);
                    return res.status(500).json({ error: 'Password changed but failed to logout' });
                }
                res.clearCookie('auth_token');
                return res.json({ message: 'Password changed successfully, please login again' });
            });
        } catch (err) {
            console.error('Change password failed:', err);
            return res.status(500).json({ error: 'Server error' });
        }
    }
);

module.exports = router;
