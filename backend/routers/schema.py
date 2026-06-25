from fastapi import APIRouter
from database import get_connection

router = APIRouter()


# ---------------- SCHEMAS ----------------
@router.get("/schemas")
def get_schemas():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT DISTINCT OWNER 
        FROM ALL_TABLES 
        ORDER BY OWNER
    """)

    data = [row[0] for row in cursor.fetchall()]

    cursor.close()
    conn.close()

    return {"schemas": data}


# ---------------- TABLES ----------------
@router.get("/tables/{schema}")
def get_tables(schema: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT TABLE_NAME 
        FROM ALL_TABLES 
        WHERE OWNER = :1
        ORDER BY TABLE_NAME
    """, [schema.upper()])

    data = [row[0] for row in cursor.fetchall()]

    cursor.close()
    conn.close()

    return {"tables": data}


# ---------------- COLUMNS ----------------
@router.get("/columns/{schema}/{table}")
def get_columns(schema: str, table: str):
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT COLUMN_NAME, DATA_TYPE
        FROM ALL_TAB_COLUMNS
        WHERE OWNER = :1
        AND TABLE_NAME = :2
        ORDER BY COLUMN_ID
    """, [schema.upper(), table.upper()])

    data = [
        {"column": row[0], "type": row[1]}
        for row in cursor.fetchall()
    ]

    cursor.close()
    conn.close()

    return {"columns": data}


# ---------------- PRIMARY KEYS ----------------
@router.get("/primary-key/{schema}/{table}")
def get_primary_key(schema: str, table: str):
    conn = get_connection()
    cursor = conn.cursor()

    try:
        # ───────── ORIGINAL PK QUERY ─────────
        cursor.execute("""
            SELECT cols.column_name
            FROM all_constraints cons
            JOIN all_cons_columns cols
              ON cons.constraint_name = cols.constraint_name
             AND cons.owner = cols.owner
            WHERE cons.constraint_type = 'P'
              AND cons.owner = :1
              AND cons.table_name = :2
        """, [schema.upper(), table.upper()])

        data = [row[0] for row in cursor.fetchall()]

        # ───────── IF PK EXISTS ─────────
        if data:
            return {"primary_keys": data}

        # ───────── FALLBACK (FIRST COLUMN) ─────────
        cursor.execute("""
            SELECT column_name
            FROM all_tab_columns
            WHERE owner = :1
              AND table_name = :2
            ORDER BY column_id
        """, [schema.upper(), table.upper()])

        cols = [row[0] for row in cursor.fetchall()]

        if cols:
            return {"primary_keys": [cols[0]]}  # fallback

        return {"primary_keys": []}

    finally:
        cursor.close()
        conn.close()