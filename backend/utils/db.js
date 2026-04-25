const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../../database/e-db.db');

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Failed to connect to database:', err.message);
    } else {
        console.log('✅ Database connected');

        db.run('PRAGMA foreign_keys = ON');

        db.run('ALTER TABLE products ADD COLUMN image_path TEXT', () => {});
        db.run('ALTER TABLE products ADD COLUMN thumbnail_path TEXT', () => {});

        db.run(`
            CREATE TABLE IF NOT EXISTS product_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pid INTEGER,
                image_path TEXT,
                thumbnail_path TEXT,
                sort_order INTEGER DEFAULT 0,
                FOREIGN KEY (pid) REFERENCES products(pid) ON DELETE CASCADE
            )
        `, () => {
            db.run('ALTER TABLE product_images ADD COLUMN pid INTEGER', () => {});
            db.run('ALTER TABLE product_images ADD COLUMN image_path TEXT', () => {});
            db.run('ALTER TABLE product_images ADD COLUMN thumbnail_path TEXT', () => {});
            db.run('ALTER TABLE product_images ADD COLUMN sort_order INTEGER DEFAULT 0', () => {});
        });

        db.run(`
            CREATE TABLE IF NOT EXISTS orders (
                order_id INTEGER PRIMARY KEY AUTOINCREMENT,
                userid INTEGER NOT NULL,
                username TEXT NOT NULL,
                currency TEXT NOT NULL,
                merchant_email TEXT NOT NULL,
                salt TEXT NOT NULL,
                digest TEXT NOT NULL,
                total_amount INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'CREATED',
                stripe_session_id TEXT UNIQUE,
                stripe_payment_intent_id TEXT UNIQUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (userid) REFERENCES users(userid)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                pid INTEGER NOT NULL,
                quantity INTEGER NOT NULL CHECK (quantity > 0),
                unit_price INTEGER NOT NULL,
                line_total INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
                FOREIGN KEY (pid) REFERENCES products(pid)
            )
        `);

        db.run(`
            CREATE TABLE IF NOT EXISTS payment_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                provider TEXT NOT NULL DEFAULT 'stripe',
                event_id TEXT NOT NULL UNIQUE,
                event_type TEXT NOT NULL,
                order_id INTEGER,
                payload_json TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders(order_id)
            )
        `);

        db.run('CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(userid, created_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC)');
        db.run('CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(order_id)');

    }
});

// Wrap sqlite methods as Promises for async/await
db.runAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
};

db.getAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

db.allAsync = function(sql, params = []) {
    return new Promise((resolve, reject) => {
        this.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

module.exports = db;