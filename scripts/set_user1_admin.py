import sqlite3
from pathlib import Path


def main() -> None:
    db_path = Path(__file__).resolve().parent.parent / "database" / "e-db.db"
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Prefer current schema column name `userid`.
    updated = 0
    try:
        cur.execute("UPDATE users SET is_admin = 1 WHERE userid = 1")
        updated = cur.rowcount or 0
    except sqlite3.OperationalError:
        # Backward compatibility for legacy schema column name `user_id`.
        cur.execute("UPDATE users SET is_admin = 1 WHERE user_id = 1")
        updated = cur.rowcount or 0

    conn.commit()
    conn.close()
    print(f"Updated rows: {updated}")


if __name__ == "__main__":
    main()
