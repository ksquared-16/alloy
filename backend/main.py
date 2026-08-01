"""
Alloy backend API. Entry point for uvicorn; the application is defined in
app/server.py.

GoHighLevel is NOT a supported Alloy integration. It was fully retired on
2026-08-01 along with the legacy cleaning product it served — no dormant path,
feature flag, environment variable, or reactivation route. This docstring
previously described GHL job dispatch, contractor-reply and cleaning lead
submission as the primary workflows; every one of those endpoints is deleted.

The backend now serves three things:

1. Payment execution — POST /admin/payments/run, called only by the
   authenticated Next.js proxy.

2. Conversation Platform dispatch — POST /internal/messages/process claims
   queued `communication_messages` rows, revalidates eligibility at the provider
   boundary, and sends via the configured provider.

3. Inbound SMS — /sms/*, Twilio signature-verified, including the
   STOP / START / HELP keyword vocabulary.

Environment variables:
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET  required; the app refuses to boot without them
- PAYMENT_EXECUTOR_SECRET                   payment executor fails closed (503) when unset
- SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   optional; writes are skipped when unset
- TWILIO_*                                  optional; the app still boots without them
- INTERNAL_CRON_TOKEN                       guards POST /internal/messages/process
"""

# Import the FastAPI app from the app module
from app.server import app

# Export app for uvicorn: uvicorn backend.main:app
__all__ = ["app"]
