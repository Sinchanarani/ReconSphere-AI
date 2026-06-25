from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_connection

router = APIRouter()


# ── Pydantic models ───────────────────────────────────────────────────

class SnapshotConfig(BaseModel):
    snapshot_name: str
    src_schema: Optional[str] = None
    src_table_name: Optional[str] = None
    src_pk_fields: Optional[str] = None
    src_pk_field_type: Optional[str] = None
    tgt_schema: Optional[str] = None
    tgt_table_name: Optional[str] = None
    tgt_pk_fields: Optional[str] = None
    tgt_pk_field_type: Optional[str] = None
    src_comparing_fields: Optional[str] = None
    src_comparing_field_type: Optional[str] = None
    tgt_comparing_fields: Optional[str] = None
    tgt_comparing_field_type: Optional[str] = None
    recon_required: Optional[str] = "Y"
    regen_required: Optional[str] = "Y"
    src_where_clause: Optional[str] = None
    tgt_where_clause: Optional[str] = None
    ignore_list: Optional[str] = None
    comments: Optional[str] = None


# ── GET all configs ───────────────────────────────────────────────────

@router.get("/config")
def get_all_configs():
    """Returns all rows in FINRECON_MASTER ordered by interface_sk."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                interface_sk, snapshot_name,
                src_schema, src_table_name,
                src_pk_fields, src_pk_field_type,
                tgt_schema, tgt_table_name,
                tgt_pk_fields, tgt_pk_field_type,
                src_comparing_fields, src_comparing_field_type,
                tgt_comparing_fields, tgt_comparing_field_type,
                recon_required, regen_required,
                src_where_clause, tgt_where_clause,
                ignore_list, comments
            FROM FINRECON_MASTER
            ORDER BY interface_sk, snapshot_name
        """)
        cols = [d[0].lower() for d in cursor.description]
        rows = cursor.fetchall()
        data = [dict(zip(cols, row)) for row in rows]
        cursor.close()
        return {"configs": data, "total": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── GET single config ─────────────────────────────────────────────────

@router.get("/config/{interface_sk}/{snapshot_name}")
def get_config(interface_sk: int, snapshot_name: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM FINRECON_MASTER
            WHERE interface_sk = :1
              AND UPPER(snapshot_name) = UPPER(:2)
        """, [interface_sk, snapshot_name])
        cols = [d[0].lower() for d in cursor.description]
        row = cursor.fetchone()
        cursor.close()
        if not row:
            raise HTTPException(status_code=404, detail="Config not found.")
        return dict(zip(cols, row))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── POST create new config ────────────────────────────────────────────

@router.post("/config")
def create_config(body: SnapshotConfig):
    """
    Inserts a new row into FINRECON_MASTER.
    interface_sk is auto-generated as MAX(interface_sk)+1.
    PK fields are stored as tilde-delimited strings (matching PL/SQL fn_getparam format).
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Auto-generate interface_sk
        cursor.execute("SELECT NVL(MAX(interface_sk), 0) + 1 FROM FINRECON_MASTER")
        new_sk = cursor.fetchone()[0]

        # Check duplicate snapshot name
        cursor.execute(
            "SELECT COUNT(*) FROM FINRECON_MASTER WHERE UPPER(snapshot_name) = UPPER(:1)",
            [body.snapshot_name]
        )
        if cursor.fetchone()[0] > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Snapshot name '{body.snapshot_name}' already exists."
            )

        cursor.execute("""
            INSERT INTO FINRECON_MASTER (
                interface_sk, snapshot_name,
                src_schema, src_table_name,
                src_pk_fields, src_pk_field_type,
                tgt_schema, tgt_table_name,
                tgt_pk_fields, tgt_pk_field_type,
                src_comparing_fields, src_comparing_field_type,
                tgt_comparing_fields, tgt_comparing_field_type,
                recon_required, regen_required,
                src_where_clause, tgt_where_clause,
                ignore_list, comments
            ) VALUES (
                :1, :2, :3, :4, :5, :6, :7, :8, :9, :10,
                :11, :12, :13, :14, :15, :16, :17, :18, :19, :20
            )
        """, [
            new_sk, body.snapshot_name.upper(),
            body.src_schema, body.src_table_name,
            body.src_pk_fields, body.src_pk_field_type,
            body.tgt_schema, body.tgt_table_name,
            body.tgt_pk_fields, body.tgt_pk_field_type,
            body.src_comparing_fields, body.src_comparing_field_type,
            body.tgt_comparing_fields, body.tgt_comparing_field_type,
            body.recon_required or "Y", body.regen_required or "Y",
            body.src_where_clause, body.tgt_where_clause,
            body.ignore_list, body.comments
        ])
        conn.commit()
        cursor.close()

        return {
            "status": "success",
            "message": f"Snapshot '{body.snapshot_name.upper()}' created with interface_sk={new_sk}.",
            "interface_sk": new_sk
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── PUT update existing config ────────────────────────────────────────

@router.put("/config/{interface_sk}/{snapshot_name}")
def update_config(interface_sk: int, snapshot_name: str, body: SnapshotConfig):
    conn = get_connection()
    try:
        cursor = conn.cursor()

        cursor.execute("""
            UPDATE FINRECON_MASTER SET
                src_schema             = :1,
                src_table_name         = :2,
                src_pk_fields          = :3,
                src_pk_field_type      = :4,
                tgt_schema             = :5,
                tgt_table_name         = :6,
                tgt_pk_fields          = :7,
                tgt_pk_field_type      = :8,
                src_comparing_fields   = :9,
                src_comparing_field_type = :10,
                tgt_comparing_fields   = :11,
                tgt_comparing_field_type = :12,
                recon_required         = :13,
                regen_required         = :14,
                src_where_clause       = :15,
                tgt_where_clause       = :16,
                ignore_list            = :17,
                comments               = :18
            WHERE interface_sk = :19
              AND UPPER(snapshot_name) = UPPER(:20)
        """, [
            body.src_schema, body.src_table_name,
            body.src_pk_fields, body.src_pk_field_type,
            body.tgt_schema, body.tgt_table_name,
            body.tgt_pk_fields, body.tgt_pk_field_type,
            body.src_comparing_fields, body.src_comparing_field_type,
            body.tgt_comparing_fields, body.tgt_comparing_field_type,
            body.recon_required or "Y", body.regen_required or "Y",
            body.src_where_clause, body.tgt_where_clause,
            body.ignore_list, body.comments,
            interface_sk, snapshot_name
        ])

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Config not found.")

        conn.commit()
        cursor.close()
        return {"status": "success", "message": f"Snapshot '{snapshot_name.upper()}' updated."}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── DELETE config ─────────────────────────────────────────────────────

@router.delete("/config/{interface_sk}/{snapshot_name}")
def delete_config(interface_sk: int, snapshot_name: str):
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            DELETE FROM FINRECON_MASTER
            WHERE interface_sk = :1
              AND UPPER(snapshot_name) = UPPER(:2)
        """, [interface_sk, snapshot_name])

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Config not found.")

        conn.commit()
        cursor.close()
        return {"status": "success", "message": f"Snapshot '{snapshot_name.upper()}' deleted."}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


# ── PATCH toggle recon_required ───────────────────────────────────────

@router.patch("/config/{interface_sk}/{snapshot_name}/toggle")
def toggle_recon_required(interface_sk: int, snapshot_name: str):
    """Toggles recon_required between Y and N."""
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE FINRECON_MASTER
            SET recon_required = CASE WHEN recon_required = 'Y' THEN 'N' ELSE 'Y' END
            WHERE interface_sk = :1
              AND UPPER(snapshot_name) = UPPER(:2)
        """, [interface_sk, snapshot_name])

        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Config not found.")

        conn.commit()
        cursor.close()
        return {"status": "success", "message": "recon_required toggled."}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
