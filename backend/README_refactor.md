> **HISTORICAL DOCUMENT.** Describes the backend as it was before the GoHighLevel
> retirement (2026-08-01). Routes and modules named here — dispatch, leads, quote,
> discounts, webhooks, debug, ghl_client — no longer exist. Retained to describe
> prior work accurately.

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
- `/stripe/webhook` (POST)
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

### 6. Test Stripe SetupIntent flow (local testing with Stripe CLI)

**Prerequisites:**
- Install Stripe CLI: https://stripe.com/docs/stripe-cli
- Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` in your environment
- Set `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in your frontend environment
- Install Stripe packages: `cd web && npm install`

**Start backend:**
```bash
cd backend
uvicorn backend.main:app --reload
```

**Forward webhooks to local server:**
```bash
stripe listen --forward-to localhost:8000/stripe/webhook
```

**Start frontend:**
```bash
cd web
npm run dev
```

**Test the flow:**
1. Navigate to `/payment?phone=+15551234567&email=test@example.com&ghl_contact_id=TEST123` (or use real values from your lead flow)
2. Enter test card details:
   - Card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
3. Click "Save Card & Confirm"
4. Verify:
   - SetupIntent is created (check backend logs for `create_setup_intent: created setup_intent_id=...`)
   - Webhook receives `setup_intent.succeeded` event (check logs for `stripe_webhook: received event type=setup_intent.succeeded`)
   - (historical) This step tagged a GoHighLevel contact. GHL was retired 2026-08-01 and this no longer occurs.
   - Success page is shown and redirects to homepage

**Trigger a test SetupIntent succeeded event manually:**
```bash
stripe trigger setup_intent.succeeded
```

**Note:** The webhook expects metadata with keys:
- `ghl_contact_id` (optional, preferred - will use this directly if present)
- `phone` (fallback for contact search if ghl_contact_id not present)
- `email` (fallback for contact search if ghl_contact_id not present)

## Notes

- All behavior is unchanged - this is a mechanical refactor only
- No API changes, no endpoint renames
- All env var names remain the same
- Render entrypoint: `uvicorn backend.main:app` (unchanged)
- Stripe webhook endpoint: `/stripe/webhook` (POST) - handles SetupIntent events only

