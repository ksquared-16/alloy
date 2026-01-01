# Backend Refactoring - Module Structure

This document describes the refactored module structure of `backend/main.py`.

## Structure

```
backend/
  main.py              # Entry point - imports app from app.server
  app/
    __init__.py        # Package marker
    server.py          # FastAPI app creation + route registration
    settings.py        # Env vars, constants, CUSTOM_FIELD_IDS
    models.py          # Pydantic models for request/response
    ghl_client.py      # All GHL API HTTP calls
    pricing.py         # Pricing calculation + breakdown parsing
    lead_processing.py # process_lead_async + orchestration
    utils.py           # normalize_phone, helpers, etc.
    routes/
      __init__.py      # Package marker
      leads.py         # /leads/cleaning, /leads/pros
      debug.py         # /debug/* endpoints
      dispatch.py      # /dispatch, /contractor-reply
      quote.py         # /quote/cleaning
```

## Verification

### 1. Check imports work
```bash
cd backend
python3 -c "from app.server import app; print('OK')"
```

### 2. Start server locally
```bash
uvicorn backend.main:app --reload
```

### 3. Verify OpenAPI schema
```bash
curl http://localhost:8000/openapi.json | jq '.paths | keys'
```

Expected endpoints:
- `/`
- `/contractors`
- `/leads/cleaning` (POST)
- `/leads/pros` (POST)
- `/dispatch` (POST)
- `/contractor-reply` (POST)
- `/quote/cleaning` (GET)
- `/debug/jobs` (GET)
- `/debug/cors` (GET)
- `/debug/quote_crash` (GET)
- `/debug/search_contact_by_phone` (GET)
- `/debug/contact_pricing` (GET)
- `/debug/quote_source` (GET)

### 4. Test a simple endpoint
```bash
curl http://localhost:8000/
# Should return: {"ok":true,"service":"alloy-dispatcher"}
```

### 5. Test /leads/cleaning returns 202
```bash
curl -X POST http://localhost:8000/leads/cleaning \
  -F "first_name=Test" \
  -F "last_name=User" \
  -F "phone=5551234567" \
  -F "email=test@example.com" \
  -F "postal_code=97701" \
  -F "home_type=House" \
  -F "service_type=Standard Cleaning" \
  -F "approximate_square_footage=1,501–2,000 sq ft" \
  -F "cleaning_frequency=Weekly"
# Should return 202 with ok: true
```

## Notes

- All behavior is unchanged - this is a mechanical refactor only
- No API changes, no endpoint renames
- All env var names remain the same
- Render entrypoint: `uvicorn backend.main:app` (unchanged)

