from fastapi import APIRouter, HTTPException
from database import get_connection
from decimal import Decimal, InvalidOperation

router = APIRouter()

# ── Category explanations (dynamic, uses actual values) ──────────────
def get_category_and_explanation(src_val, tgt_val, field_name):
    """
    Compares src and tgt values, returns:
    - category: string label
    - explanation: human-readable one-liner using actual values
    """

    src_is_null = src_val is None or str(src_val).strip() in ('', 'None', 'null')
    tgt_is_null = tgt_val is None or str(tgt_val).strip() in ('', 'None', 'null')

    # Both null → should not appear in mismatch view, but handle anyway
    if src_is_null and tgt_is_null:
        return 'MATCH', 'Both source and target are null'

    # One side null
    if src_is_null and not tgt_is_null:
        return 'NULL_MISMATCH', f'Source is null, target has value: {tgt_val}'

    if tgt_is_null and not src_is_null:
        return 'NULL_MISMATCH', f'Source has value: {src_val}, target is null'

    src_str = str(src_val).strip()
    tgt_str = str(tgt_val).strip()

    # Exact match after strip
    if src_str == tgt_str:
        return 'MATCH', 'Values are identical'

    # Try numeric comparison
    try:
        src_num = Decimal(src_str)
        tgt_num = Decimal(tgt_str)

        if src_num == tgt_num:
            return 'FORMAT_MISMATCH', (
                f'Numerically equal ({src_num}) but formatted differently '
                f'— source: "{src_val}", target: "{tgt_val}"'
            )
        else:
            diff = abs(src_num - tgt_num)
            return 'VALUE_MISMATCH', (
                f'Source: {src_val}, Target: {tgt_val} '
                f'— numeric difference of {diff}'
            )
    except InvalidOperation:
        pass

    # Case mismatch
    if src_str.upper() == tgt_str.upper():
        return 'CASE_MISMATCH', (
            f'Same value but different casing '
            f'— source: "{src_val}", target: "{tgt_val}"'
        )

    # Trim mismatch
    if src_str.strip() == tgt_str.strip():
        return 'TRIM_MISMATCH', (
            f'Values match after trimming whitespace '
            f'— source: "{src_val}", target: "{tgt_val}"'
        )

    # Genuine value mismatch
    return 'VALUE_MISMATCH', (
        f'Source: "{src_val}", Target: "{tgt_val}" '
        f'— values are genuinely different'
    )


# ── Categorize all rows from a view ──────────────────────────────────
def categorize_rows(columns, rows):
    """
    For each row, finds _SRC/_TGT pairs and enriches with:
    - category per field (replaces MATCH/MISMATCH)
    - explanation per field
    - field_summary: count of each category per column
    """
    # Find all comparing field base names
    # e.g. columns = [cust_id, amount_status, amount_src, amount_tgt, ...]
    # base_fields = ['amount', 'status', ...]
    status_cols = [c for c in columns if c.endswith('_status')]
    base_fields = [c[:-7] for c in status_cols]  # strip '_status'

    enriched_rows = []
    field_summary = {field: {} for field in base_fields}

    for row in rows:
        new_row = dict(row)

        for field in base_fields:
            src_key    = f'{field}_src'
            tgt_key    = f'{field}_tgt'
            status_key = f'{field}_status'

            src_val = row.get(src_key)
            tgt_val = row.get(tgt_key)

            category, explanation = get_category_and_explanation(
                src_val, tgt_val, field
            )

            # Replace raw MATCH/MISMATCH with category
            new_row[status_key]                  = category
            new_row[f'{field}_explanation']       = explanation

            # Tally field summary
            if category != 'MATCH':
                field_summary[field][category] = (
                    field_summary[field].get(category, 0) + 1
                )

        enriched_rows.append(new_row)

    # Build ordered column list — insert explanation after each _tgt
    enriched_columns = []
    for col in columns:
        enriched_columns.append(col)
        # After each _tgt column, insert its _explanation
        if col.endswith('_tgt'):
            base = col[:-4]  # strip '_tgt'
            enriched_columns.append(f'{base}_explanation')

    return enriched_rows, enriched_columns, field_summary


# ── Route ─────────────────────────────────────────────────────────────
@router.get("/mismatch/{snapshot_name}")
def get_mismatch_detail(snapshot_name: str):
    """
    Fetches mismatched rows from VW_<snapshot_name>,
    enriches with mismatch categories + explanations,
    and returns a field-level summary.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        try:
            cursor.execute(f"SELECT * FROM VW_{snapshot_name.upper()}")
        except Exception:
            raise HTTPException(
                status_code=404,
                detail=f"View VW_{snapshot_name.upper()} not found. Run reconciliation first."
            )

        cols = [d[0].lower() for d in cursor.description]
        raw_rows = cursor.fetchall()

        # Convert to list of dicts
        rows = []
        for row in raw_rows:
            rows.append(dict(zip(cols, [
                str(v) if v is not None else None
                for v in row
            ])))

        cursor.close()

        # Enrich with categories + explanations
        enriched_rows, enriched_cols, field_summary = categorize_rows(cols, rows)

        return {
            "snapshot_name":  snapshot_name.upper(),
            "columns":        enriched_cols,
            "rows":           enriched_rows,
            "total":          len(enriched_rows),
            "field_summary":  field_summary
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()