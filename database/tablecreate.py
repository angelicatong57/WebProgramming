#!/usr/bin/env python3
import sqlite3
from pathlib import Path

DB_PATH = Path("e-db.db")  # 按你的项目路径调整

def create_checkout_tables(db_path: Path):
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA foreign_keys = ON;")
    cur = conn.cursor()

    # 1) 订单主表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS orders (
        order_id           INTEGER PRIMARY KEY AUTOINCREMENT,
        userid             INTEGER NOT NULL,
        username           TEXT NOT NULL,
        currency           TEXT NOT NULL,
        merchant_email     TEXT NOT NULL,
        salt               TEXT NOT NULL,
        digest             TEXT NOT NULL,
        total_amount       INTEGER NOT NULL, -- 建议单位: cents
        status             TEXT NOT NULL DEFAULT 'CREATED', -- CREATED/PENDING/PAID/FAILED/CANCELLED
        stripe_session_id  TEXT UNIQUE,
        stripe_payment_intent_id TEXT UNIQUE,
        created_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userid) REFERENCES users(userid)
    );
    """)

    # 2) 订单明细表
    cur.execute("""
    CREATE TABLE IF NOT EXISTS order_items (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id     INTEGER NOT NULL,
        pid          INTEGER NOT NULL,
        quantity     INTEGER NOT NULL CHECK (quantity > 0),
        unit_price   INTEGER NOT NULL, -- cents
        line_total   INTEGER NOT NULL, -- quantity * unit_price
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
        FOREIGN KEY (pid) REFERENCES products(pid)
    );
    """)

    # 3) 支付事件表（用于 webhook 幂等/审计）
    cur.execute("""
    CREATE TABLE IF NOT EXISTS payment_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        provider     TEXT NOT NULL DEFAULT 'stripe',
        event_id     TEXT NOT NULL UNIQUE,  -- Stripe event.id
        event_type   TEXT NOT NULL,
        order_id     INTEGER,
        payload_json TEXT NOT NULL,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders(order_id)
    );
    """)

    # 索引（查询性能 + 常用筛选）
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(userid, created_at DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_order_items_pid ON order_items(pid);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_payment_events_order_id ON payment_events(order_id);")

    # 自动维护 updated_at（SQLite 触发器）
    cur.execute("""
    CREATE TRIGGER IF NOT EXISTS trg_orders_updated_at
    AFTER UPDATE ON orders
    FOR EACH ROW
    BEGIN
        UPDATE orders
        SET updated_at = CURRENT_TIMESTAMP
        WHERE order_id = OLD.order_id;
    END;
    """)

    conn.commit()
    conn.close()
    print(f"Checkout tables ready in: {db_path}")

if __name__ == "__main__":
    create_checkout_tables(DB_PATH)