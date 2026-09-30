"""
Alloy backend API. Entry point for uvicorn; the application is defined in
app/server.py.

GoHighLevel is NOT a supported Alloy integration. It was fully retired on
2026-08-01 along with the legacy cleaning product it served — no dormant path,
feature flag, environment variable, or reactivation route. This docstring
previously described GHL job dispatch, contractor-reply and cleaning lead
submission as the primary workflows; every one of those endpoints is deleted.

The backend now serves two things. Payment execution was the third and is GONE
(Payments V1 · W6-A2): `POST /admin/payments/run` inserted a Payment row before
provider execution, resolved a legacy `payment_statuses` row and confirmed a
Stripe PaymentIntent outside any canonical collection attempt — a second money
writer beside the one W1-W3 built. Its only caller was the Next.js proxy that
W6-A1 deleted, so it had none. Money is written through the registered action
registry: action -> collection attempt -> provider adapter -> canonical posting
-> Payment -> allocation. This service no longer touches Stripe at all.

1. Conversation Platform dispatch — POST /internal/messages/process claims
   queued `communication_messages` rows, revalidates eligibility at the provider
   boundary, and sends via the configured provider.

2. Inbound SMS — /sms/*, Twilio signature-verified, including the
   STOP / START / HELP keyword vocabulary.

Environment variables:
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   optional; writes are skipped when unset
- TWILIO_*                                  optional; the app still boots without them
- INTERNAL_CRON_TOKEN                       guards POST /internal/messages/process
"""

# Import the FastAPI app from the app module
from app.server import app

# Export app for uvicorn: uvicorn backend.main:app
__all__ = ["app"]
