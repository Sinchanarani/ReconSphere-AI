from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from database import get_connection
import pandas as pd
import io

router = APIRouter()

@router.get("/export/{snapshot_name}")
def export_snapshot(snapshot_name: str, format: str = "excel"):
    """
    Exports mismatch data for a snapshot as Excel or CSV.
    Usage: /api/export/MY_SNAPSHOT?format=excel
           /api/export/MY_SNAPSHOT?format=csv
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        try:
            cursor.execute(f"SELECT * FROM VW_{snapshot_name.upper()}")
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"View VW_{snapshot_name.upper()} not found."
            )

        cols = [d[0] for d in cursor.description]
        rows = cursor.fetchall()
        cursor.close()

        df = pd.DataFrame(rows, columns=cols)

        if format.lower() == "csv":
            output = io.StringIO()
            df.to_csv(output, index=False)
            output.seek(0)
            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={
                    "Content-Disposition":
                        f"attachment; filename=FinRecon_{snapshot_name}.csv"
                }
            )
        else:
            # Default: Excel
            output = io.BytesIO()
            with pd.ExcelWriter(output, engine="openpyxl") as writer:
                df.to_excel(writer, index=False, sheet_name="Mismatches")

                # Auto-size columns
                worksheet = writer.sheets["Mismatches"]
                for col in worksheet.columns:
                    max_len = max(
                        len(str(cell.value)) if cell.value else 0
                        for cell in col
                    )
                    worksheet.column_dimensions[col[0].column_letter].width = min(max_len + 4, 50)

            output.seek(0)
            return StreamingResponse(
                io.BytesIO(output.read()),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={
                    "Content-Disposition":
                        f"attachment; filename=FinRecon_{snapshot_name}.xlsx"
                }
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()