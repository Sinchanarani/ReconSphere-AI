from fastapi import APIRouter, HTTPException
from database import get_connection

router = APIRouter()

@router.get("/snapshots")
def get_snapshots():
    """
    Returns all active snapshots with their latest status
    from FINRECON_RESULT and mismatch count from views.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # Get all active snapshots from master
        cursor.execute("""
            SELECT
                m.interface_sk,
                m.snapshot_name,
                m.src_schema || '.' || m.src_table_name  AS src_table,
                m.tgt_schema || '.' || m.tgt_table_name  AS tgt_table,
                m.comments
            FROM FINRECON_MASTER m
            WHERE m.recon_required = 'Y'
            ORDER BY m.interface_sk, m.snapshot_name
        """)
        rows = cursor.fetchall()
        cols = [d[0].lower() for d in cursor.description]
        snapshots = [dict(zip(cols, row)) for row in rows]

        # For each snapshot, get latest result + live mismatch count
        for snap in snapshots:
            name = snap["snapshot_name"]

            # Latest result from FINRECON_RESULT
            cursor.execute("""
                SELECT result_data, recon_type, log_timestamp
                FROM FINRECON_RESULT
                WHERE snapshot_name = :1
                ORDER BY log_timestamp DESC
                FETCH FIRST 1 ROWS ONLY
            """, [name])
            result_row = cursor.fetchone()

            if result_row:
                snap["result_data"] = result_row[0]

                db_type = result_row[1]

                # 🔥 FIX START
                if not db_type:
                    snap["recon_type"] = "PENDING"
                else:
                    snap["recon_type"] = db_type
                # 🔥 FIX END

                snap["last_run"] = result_row[2].strftime("%d-%b-%Y %H:%M:%S") if result_row[2] else None
            else:
                snap["result_data"]   = "Not yet run"
                snap["recon_type"]    = "PENDING"
                snap["last_run"]      = None

            # Live mismatch count from view
            try:
                view_name = f"VW_{name.upper()}"

                cursor.execute(f"SELECT * FROM {view_name} WHERE ROWNUM = 1")
                columns = [col[0] for col in cursor.description]

                status_cols = [col for col in columns if col.upper().endswith('_STATUS') and col.upper() != 'STATUS']

                if status_cols:
                    conditions = " OR ".join([f"{col} = 'MISMATCH'" for col in status_cols])

                    cursor.execute(f"""
                        SELECT COUNT(*) FROM {view_name}
                        WHERE RECORD_TYPE = 'COMPARE'
                        AND ({conditions})
                    """)
                    snap["mismatch_count"] = cursor.fetchone()[0]
                    if snap["mismatch_count"] > 0:
                        snap["recon_type"] = "MISMATCH"
                    else:
                        snap["recon_type"] = "MATCH"
                else:
                    snap["mismatch_count"] = 0

            except Exception:
                snap["mismatch_count"] = None
        cursor.close()
        return {"snapshots": snapshots}        
    finally:
        conn.close()


@router.post("/run-recon")
def run_full_recon():
    """
    Triggers the full PL/SQL reconciliation engine.
    Replaces what ODI used to do — runs all interfaces.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute("BEGIN Finrecon_format.pr_udtc_integrate_full; END;")
        conn.commit()
        cursor.close()
        return {"status": "success", "message": "Full reconciliation completed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@router.post("/run-recon/{interface_sk}")
def run_recon_by_interface(interface_sk: int):
    """
    Triggers reconciliation for a single interface_sk only.
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()
        cursor.execute(
            "BEGIN PR_COMMON(:1); END;",
            [interface_sk]
        )
        conn.commit()
        cursor.close()
        return {
            "status": "success",
            "message": f"Reconciliation for interface_sk={interface_sk} completed."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@router.get("/snapshot/{snapshot_name}")
def get_snapshot_detail(snapshot_name: str):
    """
    Returns full detail for one snapshot:
    - Config from FINRECON_MASTER
    - Latest result from FINRECON_RESULT
    - Run history (last 10)
    - Live mismatch count from view
    - Mismatch rows with categorization (top 20)
    """
    conn = get_connection()
    try:
        cursor = conn.cursor()

        # ── Config from FINRECON_MASTER ───────────────────────────
        cursor.execute("""
            SELECT
                interface_sk,
                snapshot_name,
                src_schema, src_table_name,
                src_schema || '.' || src_table_name  AS src_table,
                tgt_schema, tgt_table_name,
                tgt_schema || '.' || tgt_table_name  AS tgt_table,
                src_pk_fields,
                src_comparing_fields,
                tgt_comparing_fields,
                src_comparing_field_type,
                src_where_clause,
                tgt_where_clause,
                recon_required,
                comments
            FROM FINRECON_MASTER
            WHERE UPPER(snapshot_name) = UPPER(:1)
              AND recon_required = 'Y'
            FETCH FIRST 1 ROWS ONLY
        """, [snapshot_name])

        row = cursor.fetchone()
        if not row:
            raise HTTPException(
                status_code=404,
                detail=f"Snapshot '{snapshot_name}' not found."
            )

        cols = [d[0].lower() for d in cursor.description]
        config = dict(zip(cols, row))

        # Clean up pk and comparing fields into lists
        def split_fields(field_str):
            if not field_str:
                return []
            parts = []
            i = 1
            while True:
                val = _getparam(field_str, i)
                if val == 'EOPL' or val is None:
                    break
                parts.append(val)
                i += 1
            return parts

        config['pk_fields_list']        = split_fields(config.get('src_pk_fields', ''))
        config['comparing_fields_list'] = split_fields(config.get('src_comparing_fields', ''))
        config['field_types_list']      = split_fields(config.get('src_comparing_field_type', ''))

        # ── Latest result ─────────────────────────────────────────
        cursor.execute("""
            SELECT result_data, recon_type,
                   TO_CHAR(log_timestamp, 'DD-Mon-YYYY HH24:MI:SS') AS last_run
            FROM FINRECON_RESULT
            WHERE UPPER(snapshot_name) = UPPER(:1)
            ORDER BY log_timestamp DESC
            FETCH FIRST 1 ROWS ONLY
        """, [snapshot_name])

        result_row = cursor.fetchone()
        if result_row:
            config['result_data'] = result_row[0]
            config['last_run']    = result_row[2]

            # default
            config['recon_type'] = 'MATCH'
        else:
            config['result_data'] = 'Not yet run'
            config['recon_type']  = 'PENDING'
            config['last_run']    = None

        # ── Run history (last 10) ─────────────────────────────────
        cursor.execute("""
            SELECT result_data, recon_type,
                   TO_CHAR(log_timestamp, 'DD-Mon-YYYY HH24:MI:SS') AS run_time
            FROM FINRECON_RESULT
            WHERE UPPER(snapshot_name) = UPPER(:1)
            ORDER BY log_timestamp DESC
            FETCH FIRST 10 ROWS ONLY
        """, [snapshot_name])

        history_rows = cursor.fetchall()
        config['run_history'] = []

        for r in history_rows:

            result_data = r[0] if r[0] else ''

            # calculate mismatch count directly from view
            mismatch_count = 0

            try:
                cur2 = conn.cursor()

                cur2.execute(f"""
                    SELECT COUNT(*)
                    FROM VW_{snapshot_name}
                    WHERE RECORD_TYPE != 'COMPARE'
                """)

                mismatch_count = cur2.fetchone()[0]

# also check field-level mismatches
                if mismatch_count == 0:

                    cur2.execute(f"""
                        SELECT *
                        FROM VW_{snapshot_name}
                    """)

                    cols = [d[0] for d in cur2.description]
                    rows = cur2.fetchall()

                    status_cols = [c for c in cols if c.endswith('_STATUS')]

                    for row in rows:
                        row_dict = dict(zip(cols, row))

                        for sc in status_cols:
                            if row_dict.get(sc) != 'MATCH':
                                mismatch_count += 1
                                break

                        if mismatch_count > 0:
                            break
                cur2.close()

            except:
                mismatch_count = 0

            # calculate totals
            try:

                src_table_full = f"{config['src_schema']}.{config['src_table_name']}"

                src_where = config.get('src_where_clause')

                cur3 = conn.cursor()

                # WHERE clause logic
                if src_where and src_where.strip():

                    where_clause = src_where.strip()

                    if where_clause.upper().startswith("SRC:"):
                        where_clause = where_clause[4:].strip()

                    cur3.execute(f"""
                        SELECT COUNT(*)
                        FROM {src_table_full}
                        WHERE {where_clause}
                    """)

                else:

                    # existing logic
                    cur3.execute(f"""
                        SELECT COUNT(*)
                        FROM {src_table_full}
                    """)

                total_records = cur3.fetchone()[0]

                matched_records = total_records - mismatch_count

                if matched_records < 0:
                    matched_records = 0

                cur3.close()

            except:
                total_records = 0
                matched_records = 0


            if mismatch_count > 0:

                recon_type = 'MISMATCH'

                result_data = (
                    f"{mismatch_count} mismatch(es) found out of "
                    f"{total_records} record(s). "
                    f"{matched_records} record(s) matched."
                )

            else:

                recon_type = 'MATCH'

                result_data = (
                    f"0 mismatch(es) found out of "
                    f"{total_records} record(s). "
                    f"{matched_records} record(s) matched."
                )

            config['run_history'].append({
                'result_data': result_data,
                'recon_type': recon_type,
                'run_time': r[2]
            })

        # ── Live counts from view ─────────────────────────────────
        # mismatch (only compare rows)
        try:
            view_name = f"VW_{snapshot_name.upper()}"

            # Step 1: Get columns dynamically
            cursor.execute(f"SELECT * FROM {view_name} WHERE ROWNUM = 1")
            columns = [col[0] for col in cursor.description]

            # Step 2: Pick all *_STATUS columns
            status_cols = [col for col in columns if col.upper().endswith('_STATUS') and col.upper() != 'STATUS']

            # Step 3: Build dynamic mismatch condition
            if status_cols:
                conditions = " OR ".join([f"{col} = 'MISMATCH'" for col in status_cols])

                cursor.execute(f"""
                    SELECT COUNT(*) FROM {view_name}
                    WHERE RECORD_TYPE = 'COMPARE'
                    AND ({conditions})
                """)
                config['mismatch_count'] = cursor.fetchone()[0]
                
            else:
                config['mismatch_count'] = 0

        except Exception as e:
            print("Mismatch calculation error:", e)
            config['mismatch_count'] = 0

        # missing in target
        try:
            cursor.execute(f"""
                SELECT COUNT(*) FROM VW_{snapshot_name.upper()}
                WHERE RECORD_TYPE = 'MISSING_IN_TARGET'
            """)
            config['missing_in_target'] = cursor.fetchone()[0]
        except Exception:
            config['missing_in_target'] = 0

        # missing in source
        try:
            cursor.execute(f"""
                SELECT COUNT(*) FROM VW_{snapshot_name.upper()}
                WHERE RECORD_TYPE = 'MISSING_IN_SOURCE'
            """)
            config['missing_in_source'] = cursor.fetchone()[0]
        except Exception:
            config['missing_in_source'] = 0

        # total count
        try:

            src_table_full = f"{config['src_schema']}.{config['src_table_name']}"

            src_where = config.get('src_where_clause')

            if src_where and src_where.strip():

                where_clause = src_where.strip()

                # remove SRC: prefix if present
                if where_clause.upper().startswith("SRC:"):
                    where_clause = where_clause[4:].strip()

                cursor.execute(f"""
                    SELECT COUNT(*)
                    FROM {src_table_full}
                    WHERE {where_clause}
                """)

            else:

                # existing logic (unchanged)
                cursor.execute(f"""
                    SELECT COUNT(*)
                    FROM {src_table_full}
                """)

            config['total_count'] = cursor.fetchone()[0]

        except Exception as e:
            print("Total count error:", e)
            config['total_count'] = None   

        cursor.execute(f"""
            SELECT COUNT(*) FROM VW_{snapshot_name.upper()}
            WHERE RECORD_TYPE = 'COMPARE'
        """)
        compare_count = cursor.fetchone()[0]

        config['matched_count'] = compare_count - config['mismatch_count']
        if config['mismatch_count'] > 0:
            config['recon_type'] = 'MISMATCH'
        else:
            config['recon_type'] = 'MATCH'
        
        print("mismatch:", config['mismatch_count'])
        print("missing_tgt:", config['missing_in_target'])
        print("missing_src:", config['missing_in_source'])
        print("total:", config['total_count'])
        print("matched:", config['matched_count'])

        # ── Top 20 mismatch rows ──────────────────────────────────
        mismatch_data = []
        mismatch_cols = []
        field_summary = {}

        try:
            cursor.execute(
                f"SELECT * FROM VW_{snapshot_name.upper()} "
                f"FETCH FIRST 20 ROWS ONLY"
            )
            raw_cols = [d[0].lower() for d in cursor.description]
            raw_rows = cursor.fetchall()

            rows_as_dicts = [
                dict(zip(raw_cols, [
                    str(v) if v is not None else None for v in r
                ]))
                for r in raw_rows
            ]

            # Import categorize from mismatch router
            from routers.mismatch import categorize_rows
            enriched_rows, enriched_cols, field_summary = categorize_rows(
                raw_cols, rows_as_dicts
            )
            mismatch_data = enriched_rows
            mismatch_cols = enriched_cols

        except Exception:
            pass

        cursor.close()

        return {
            "config":        config,
            "mismatch_cols": mismatch_cols,
            "mismatch_rows": mismatch_data,
            "field_summary": field_summary
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


def _getparam(text, pos, sep='~'):
    """Python equivalent of PL/SQL fn_getparam."""
    if not text or not text.strip():
        return None
    parts = text.split(sep)
    if pos < 1 or pos > len(parts):
        return 'EOPL'
    val = parts[pos - 1]
    return val if val else 'EOPL'
