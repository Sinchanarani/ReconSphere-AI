from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_pool
from mainai import app as ai_app
from routers import recon, mismatch, history, export, config
from routers import schema



app = FastAPI(
    title="FinRecon API",
    description="Metadata-driven reconciliation engine — REST API",
    version="1.0.0"
)

# Allow React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default port
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize DB pool on startup
@app.on_event("startup")
def startup():
    init_pool()

# Register all route groups
app.include_router(recon.router,    prefix="/api", tags=["Reconciliation"])
app.include_router(mismatch.router, prefix="/api", tags=["Mismatch"])
app.include_router(history.router,  prefix="/api", tags=["History"])
app.include_router(export.router,   prefix="/api", tags=["Export"])
app.include_router(config.router,   prefix="/api", tags=["Configuration"])
app.include_router(schema.router, prefix="/api", tags=["Schema"])

@app.get("/")
def root():
    return {"message": "FinRecon API is running"}
app.mount("/ai", ai_app)