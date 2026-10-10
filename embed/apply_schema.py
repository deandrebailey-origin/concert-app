from db import get_conn

with open("../db/schema.sql") as f:
    sql = f.read()

with get_conn() as conn:
    conn.execute(sql)
    conn.commit()
    tables = conn.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
    ).fetchall()
    print("Tables:", [t[0] for t in tables])