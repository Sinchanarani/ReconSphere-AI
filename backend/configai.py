import os
from dotenv import load_dotenv
from pathlib import Path

# Force load .env from the current directory
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Mapped to your specific .env keys
ORACLE_USER     = os.getenv("DB_USER")
ORACLE_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST         = os.getenv("DB_HOST")
DB_PORT         = os.getenv("DB_PORT")
DB_SERVICE      = os.getenv("DB_SERVICE")

# Construct the DSN (host:port/service_name)
ORACLE_DSN      = f"{DB_HOST}:{DB_PORT}/{DB_SERVICE}"

# AI Settings
OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3")

