from fastapi import FastAPI, Request

app = FastAPI()

@app.post("/gohighlevel/webhook")
async def ghl_webhook(request: Request):
    payload = await request.json()
    # For now just log it so we can see what GHL sends
    print("Received webhook:", payload)
    return {"status": "ok"}