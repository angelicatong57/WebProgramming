import sqlite3
from pathlib import Path


def main() -> None:
    db_path = Path(__file__).resolve().parent.parent / "database" / "e-db.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Recreate users table from scratch every run.
    cur.execute("DROP TABLE IF EXISTS users")

    # Hard-coded users table schema per requirement.
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            userid INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_time DATETIME DEFAULT CURRENT_TIMESTAMP
        )
        """
    )

    conn.commit()
    conn.close()
    print(f"users table is ready at: {db_path}")


if __name__ == "__main__":
    main()
