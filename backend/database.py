import oracledb
from dotenv import load_dotenv
import os
from pathlib import Path

# Explicitly point to .env file in the same folder as this script
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

DB_USER     = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST     = os.getenv("DB_HOST")
DB_PORT     = os.getenv("DB_PORT", "1521")
DB_SERVICE  = os.getenv("DB_SERVICE")

DSN = f"{DB_HOST}:{DB_PORT}/{DB_SERVICE}"

# Connection pool — created once when backend starts
pool: oracledb.ConnectionPool = None

def init_pool():
    global pool
    pool = oracledb.create_pool(
        user=DB_USER,
        password=DB_PASSWORD,
        dsn=DSN,
        min=2,
        max=10,
        increment=1
    )
    print(f"✅ Oracle connection pool initialized → {DSN}")

def get_connection():
    """Call this in every route to get a connection from the pool."""
    return pool.acquire()