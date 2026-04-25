function requireLogin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    return next();
}

function requireAdmin(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.session.user.is_admin !== 1) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
}

module.exports = {
    requireLogin,
    requireAdmin
};
