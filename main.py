from fastapi import FastAPI, Request
from pydantic import BaseModel

app = FastAPI()


# ---------- Simple status checks ----------

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Alloy dispatcher is live"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


# ---------- Webhook payload model ----------

class GHLWebhookPayload(BaseModel):
    data: dict | None = None


# ---------- Webhook endpoint for GHL ----------

@app.post("/dispatch")
async def dispatch(request: Request):
    body = await request.json()
    print("Received payload from GHL:", body)
    # later: look up contractors + send SMS via GHL API
    return {"ok": True}