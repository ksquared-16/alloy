# Message Sender (SMS via Twilio)

The backend consumes queued rows from `public.messages` and sends SMS via Twilio. The web app (Vercel) only enqueues; this runs on the backend (Render).

## Environment variables (Render)

Set these in the Render service **Environment**:

| Variable | Required | Description |
|----------|----------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes | Twilio auth token |
| `TWILIO_FROM_NUMBER` | Yes | Twilio phone number (E.164, e.g. +15551234567) |
| `INTERNAL_CRON_TOKEN` | Yes | Secret token for `POST /internal/messages/process` (e.g. random string) |

Existing Supabase vars must also be set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Manual test locally (curl)

1. **Insert a queued message in Supabase**  
   In SQL editor or via API, insert a row into `public.messages`:
   - `channel` = `'sms'`
   - `direction` = `'outbound'`
   - `status` = `'queued'`
   - `to_value` = `'+1XXXXXXXXXX'` (valid E.164 number)
   - `body` = `'hello'`
   - Optionally set `workflow_run_id`, `customer_id`, `contact_id`, `job_id`, `opportunity_id`.

2. **Call the endpoint with the cron token**  
   Replace `YOUR_CRON_TOKEN` and optionally the port:

   ```bash
   curl -X POST http://localhost:8000/internal/messages/process \
     -H "Content-Type: application/json" \
     -H "x-cron-token: YOUR_CRON_TOKEN" \
     -d '{"limit": 25}'
   ```

3. **Verify the row**  
   - `status` should be `'sent'`
   - `provider` = `'twilio'`
   - `provider_message_id` set (Twilio SID)
   - `sent_at` set

## Running on Render

1. **Set env vars** in the Render service (see table above).
2. **Redeploy** the backend so the new code and env are active.
3. **Manual test**: call the endpoint (use your Render backend URL and the same token):

   ```bash
   curl -X POST https://YOUR_SERVICE.onrender.com/internal/messages/process \
     -H "Content-Type: application/json" \
     -H "x-cron-token: YOUR_CRON_TOKEN" \
     -d '{"limit": 5}'
   ```

4. **Render Cron Job**  
   - Create a **Cron Job** that runs every minute (or desired interval).
   - **Command** can be a curl call, or use a scheduled job that hits the backend URL.
   - **URL**: `POST https://YOUR_BACKEND_SERVICE.onrender.com/internal/messages/process`
   - **Header**: `x-cron-token: <INTERNAL_CRON_TOKEN>`
   - Optionally send body `{"limit": 25}`.

   If Render supports “HTTP request” as a cron action, use that with the URL and header above. Otherwise run a small script or `curl` from a cron worker that performs the POST.

## Failure test

- Insert a queued message with an invalid `to_value` (e.g. `'invalid'`).
- Call `POST /internal/messages/process` with valid token.
- The row should update to `status = 'failed'` and `error` populated (exception message, truncated to 500 chars).

## DB columns used

The service expects these columns on `public.messages`:

- `id`, `status`, `sent_at`, `provider`, `provider_message_id`, `error`
- `channel`, `direction`, `to_value`, `body`, `created_at`

If an update fails with a missing column, check backend logs; no migrations are added in this feature—report any missing column and we can add it later.
