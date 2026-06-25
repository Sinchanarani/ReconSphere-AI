from fastapi import APIRouter, HTTPException
from database import get_connection

router = APIRouter()

@router.get("/history")
def get_history():
    """
    Returns all past reconciliation results from FINRECON_RESULT,
    most recent first.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                snapshot_name,
                result_data,
                recon_type,
                comments,
                TO_CHAR(log_timestamp, 'DD-Mon-YYYY HH24:MI:SS') AS run_time
            FROM FINRECON_RESULT
            ORDER BY log_timestamp DESC
        """)
        rows = cursor.fetchall()
        cols = [d[0].lower() for d in cursor.description]
        data = [dict(zip(cols, row)) for row in rows]
        cursor.close()
        return {"history": data, "total": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.get("/history/{snapshot_name}")
def get_history_by_snapshot(snapshot_name: str):
    """
    Returns run history for one specific snapshot.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT
                snapshot_name,
                result_data,
                recon_type,
                comments,
                TO_CHAR(log_timestamp, 'DD-Mon-YYYY HH24:MI:SS') AS run_time
            FROM FINRECON_RESULT
            WHERE UPPER(snapshot_name) = UPPER(:1)
            ORDER BY log_timestamp DESC
        """, [snapshot_name])
        rows = cursor.fetchall()
        cols = [d[0].lower() for d in cursor.description]
        data = [dict(zip(cols, row)) for row in rows]
        cursor.close()
        return {"snapshot_name": snapshot_name.upper(), "history": data, "total": len(data)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()