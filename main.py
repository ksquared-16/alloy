from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI()

# --- Simple status checks ---

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Alloy dispatcher is live"}

@app.get("/health")
def health_check():
    return {"status": "ok"}


# --- GHL webhook / dispatcher placeholder ---

class GHLWebhookPayload(BaseModel):
    # Make it generic for now – we’ll refine later once we see GHL’s JSON
    data: dict | None = None

@app.post("/dispatch")
async def dispatch(request: Request):
    body = await request.json()
    print("Received payload from GHL:", body)

    # For now we just acknowledge – later we’ll:
    # 1) look up contractors
    # 2) fan-out SMS via GHL API
    return {"ok": True}