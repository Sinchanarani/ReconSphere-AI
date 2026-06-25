from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import oracledb
import requests
import json
import re
import time
import configai as cfg

app = FastAPI(title="FinRecon AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- DB CONNECTION ----------------
def get_connection():
    try:
        return oracledb.connect(
            user=cfg.ORACLE_USER,
            password=cfg.ORACLE_PASSWORD,
            dsn=cfg.ORACLE_DSN
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Oracle Connection Error: {str(e)}")


# 🔥 ADDED: PK AUTO-DETECTION
def get_primary_key(schema: str, table: str):
    try:
        conn = get_connection()
        cur = conn.cursor()

        cur.execute("""
            SELECT cols.column_name
            FROM all_constraints cons
            JOIN all_cons_columns cols
              ON cons.constraint_name = cols.constraint_name
            WHERE cons.constraint_type = 'P'
            AND cons.table_name = :1
            AND cons.owner = :2
        """, [table.upper(), schema.upper()])

        row = cur.fetchone()
        return row[0] if row else None

    except Exception:
        return None
    finally:
        try:
            cur.close()
            conn.close()
        except:
            pass


# ---------------- REQUEST MODELS ----------------
class GenerateRequest(BaseModel):
    user_prompt: str

class ExecuteRequest(BaseModel):
    sql_scripts: List[str]
    snapshot_name: str
    metadata: Optional[dict] = None


# ---------------- SQL GENERATOR ----------------
def generate_recon_sql(meta: dict):
    src = meta["src_table"]
    tgt = meta["tgt_table"]
    pk = meta["pk_fields"]
    fields = meta["recon_fields"].split("~")

    compare_conditions = " AND ".join([f"s.{col} = t.{col}" for col in fields])

    select_cols = [f"COALESCE(s.{pk}, t.{pk}) AS {pk}"]

    for col in fields:
        select_cols.append(f"s.{col} AS SRC_{col}")
        select_cols.append(f"t.{col} AS TGT_{col}")

    select_cols_str = ",\n    ".join(select_cols)

    sql = f"""
SELECT
    {select_cols_str},

    CASE
        WHEN s.{pk} IS NULL THEN 'MISSING_IN_SOURCE'
        WHEN t.{pk} IS NULL THEN 'MISSING_IN_TARGET'
        WHEN {compare_conditions} THEN 'MATCH'
        ELSE 'MISMATCH'
    END AS RECORD_TYPE

FROM {src} s
FULL OUTER JOIN {tgt} t
ON s.{pk} = t.{pk}
"""

    return sql.strip()


# ---------------- AI METADATA EXTRACTION ----------------
def extract_metadata(user_prompt: str):
    prompt = f"""
Extract structured metadata from the user request.

Return ONLY JSON in this format:
{{
  "src_table": "",
  "tgt_table": "",
  "pk_fields": "",
  "recon_fields": "",
  "snapshot_name": ""
}}

Rules:
- recon_fields must be separated by ~
- include schema name if present
- extract snapshot_name if user mentions it

User Request:
{user_prompt}
"""

    try:
        resp = requests.post(
            f"{cfg.OLLAMA_BASE_URL}/api/generate",
            json={
                "model": cfg.OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False
            },
            timeout=60
        )

        data = resp.json()
        raw = data.get("response", "").strip()

        json_match = re.search(r"\{.*\}", raw, re.DOTALL)

        if not json_match:
            raise Exception("Failed to extract metadata from AI")

        meta = json.loads(json_match.group(0))
        # 🔥 FORCE snapshot extraction from user text if AI fails
        if not meta.get("snapshot_name"):
            match = re.search(r"reconciliation\s+([A-Za-z0-9_]+)", user_prompt, re.IGNORECASE)
            if match:
                meta["snapshot_name"] = match.group(1).upper()

        # 🔥 ADDED: SMART SNAPSHOT NAME
        snap = meta.get("snapshot_name")
        if not snap or str(snap).strip() == "":
            meta["snapshot_name"] = f"AI_RECON_{int(time.time())}"
        else:
            meta["snapshot_name"] = str(snap).upper().strip()

        # 🔥 ADDED: PK AUTO-DETECTION
        if not meta.get("pk_fields"):
            try:
                src_schema, src_table = meta["src_table"].split(".")
                pk = get_primary_key(src_schema, src_table)
                if pk:
                    meta["pk_fields"] = pk
            except Exception:
                pass

        return meta

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Metadata Error: {str(e)}")


# ---------------- GENERATE API ----------------
@app.post("/generate")
def generate_sql(req: GenerateRequest):

    meta = extract_metadata(req.user_prompt)

    sql = generate_recon_sql(meta)

    return {
        "success": True,
        "scripts": [
            {
                "title": "Reconciliation Query",
                "tag": "SQL",
                "code": sql
            }
        ],
        "parsed": meta,
        "snapshot_name": meta.get("snapshot_name")  # 🔥 ADDED
    }


# ---------------- EXECUTE API ----------------
@app.post("/execute")
def execute_scripts(req: ExecuteRequest):

    conn = get_connection()
    cur = conn.cursor()
    steps = []

    meta = req.metadata or {}

    try:
        # -------- Execute SQL (skip SELECT only) --------
        for sql in req.sql_scripts:
            stmt = sql.strip()

            if not stmt:
                continue

            try:
                if stmt.upper().startswith("SELECT"):
                    steps.append({"status": "skipped", "msg": "SELECT skipped"})
                    continue

                cur.execute(stmt)
                steps.append({"status": "success", "msg": "Executed"})

            except Exception as e:
                steps.append({"status": "error", "msg": str(e)})

        # 🔥 ADDED: USE AI SNAPSHOT NAME
        snapshot_name = meta.get("snapshot_name") or req.snapshot_name

        # -------- Metadata Parsing --------
        src_raw = meta.get('src_table')
        tgt_raw = meta.get('tgt_table')

        src_schema, src_table = src_raw.split('.')
        tgt_schema, tgt_table = tgt_raw.split('.')

        # -------- INSERT INTO MASTER --------
        insert_sql = f"""
            INSERT INTO {cfg.FINRECON_MASTER_TABLE} (
                INTERFACE_SK,
                SNAPSHOT_NAME,
                SRC_SCHEMA, SRC_TABLE_NAME, SRC_PK_FIELDS, SRC_COMPARING_FIELDS,
                TGT_SCHEMA, TGT_TABLE_NAME, TGT_PK_FIELDS, TGT_COMPARING_FIELDS,
                RECON_REQUIRED, REGEN_REQUIRED, COMMENTS
            ) VALUES (
                FINRECON_MASTER_SEQ.NEXTVAL,
                :1, :2, :3, :4, :5, :6, :7, :8, :9,
                'Y', 'Y', 'AI Generated'
            )
        """

        cur.execute(insert_sql, [
            snapshot_name,
            src_schema,
            src_table,
            meta.get('pk_fields'),
            meta.get('recon_fields'),
            tgt_schema,
            tgt_table,
            meta.get('pk_fields'),
            meta.get('recon_fields')
        ])

        conn.commit()

        # -------- Fetch SK --------
        cur.execute(
            f"""SELECT INTERFACE_SK 
                FROM {cfg.FINRECON_MASTER_TABLE} 
                WHERE SNAPSHOT_NAME = :1 
                ORDER BY INTERFACE_SK DESC""",
            [snapshot_name]
        )

        row = cur.fetchone()

        return {
            "success": True,
            "steps": steps,
            "sk": row[0] if row else None,
            "snapshot_name": snapshot_name  # 🔥 ADDED
        }

    except Exception as e:
        return {
            "success": False,
            "detail": str(e),
            "steps": steps
        }

    finally:
        cur.close()
        conn.close()