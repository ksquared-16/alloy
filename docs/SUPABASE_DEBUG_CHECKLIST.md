# Supabase Write Debugging Checklist

## Overview

This document provides a checklist for debugging Supabase writes in staging after deploying the enhanced logging changes.

## Changes Made

### 1. Enhanced Logging

**Log Prefixes (grep-able in Render logs):**
- `SUPA_WRITE_ATTEMPT` - Logged before any Supabase write operation
- `SUPA_WRITE_SUCCESS` - Logged after successful write
- `SUPA_WRITE_FAILED` - Logged on errors (includes full stack trace)

**Files Updated:**
- `backend/app/supabase_client.py` - All helper functions now log with SUPA_* prefixes
- `backend/app/routes/leads.py` - POST /leads/cleaning route logs all Supabase write attempts
- `backend/app/routes/dispatch.py` - POST /dispatch route logs all Supabase write attempts

### 2. Debug Endpoint

**Route:** `GET /debug/supabase`

**Security:** 
- Returns 404 in production
- Only enabled in staging/dev environments

**Response:**
```json
{
  "has_url": true/false,
  "has_service_key": true/false,
  "base_url": "https://xxx.supabase.co/rest/v1",
  "query_result": {
    "status": "success" | "failed" | "exception",
    "row_count": 1,
    "sample_row": { "id": "...", "slug": "cleaning" }
  },
  "error": null | "error message"
}
```

## Post-Deployment Checklist

### Step 1: Verify Supabase Connectivity

1. **Hit the debug endpoint:**
   ```
   GET https://staging-alloy.onrender.com/debug/supabase
   ```

2. **Expected response:**
   - `has_url: true`
   - `has_service_key: true`
   - `query_result.status: "success"`
   - `query_result.row_count: 1` (or more)
   - `error: null`

3. **If connectivity fails:**
   - Check Render environment variables:
     - `SUPABASE_URL` is set
     - `SUPABASE_SERVICE_ROLE_KEY` is set
   - Verify values are correct (no extra spaces, correct format)
   - Check Render service logs for any startup errors

### Step 2: Submit a Test Cleaning Lead

1. **Submit a cleaning lead** via the staging website (or direct API call to `/leads/cleaning`)

2. **Search Render logs for these lines (in order):**

   ```
   SUPA_WRITE_ATTEMPT route=/leads/cleaning
   ```
   - Should appear immediately after GHL contact creation
   - Check: `ghl_contact_id`, `email` (masked), `phone` (masked), `vertical_key=cleaning`

   ```
   SUPA_WRITE_ATTEMPT route=/leads/cleaning config_check
   ```
   - Should show: `has_url=true has_key=true`
   - If false: Env vars not loaded correctly

   ```
   SUPA_WRITE_ATTEMPT entity=contact action=upsert
   ```
   - Should appear from `supabase_client.py`
   - Check: `email` (masked), `phone` (masked)

   ```
   SUPA_WRITE_SUCCESS entity=contact action=create|update
   ```
   - Should show: `internal_id` (Supabase UUID)
   - If missing: Contact upsert failed

   ```
   SUPA_WRITE_SUCCESS route=/leads/cleaning step=contact_upsert
   ```
   - Should show: `supabase_contact_id` and `ghl_contact_id`

   ```
   SUPA_WRITE_ATTEMPT entity=external_mapping
   ```
   - Should appear for contact mapping
   - Check: `source=ghl entity_type=contact`

   ```
   SUPA_WRITE_SUCCESS route=/leads/cleaning step=external_mapping_contact
   ```
   - Confirms external mapping created

   ```
   SUPA_WRITE_ATTEMPT entity=vertical action=lookup slug=cleaning
   ```
   - Should appear when looking up vertical_id

   ```
   SUPA_WRITE_SUCCESS entity=vertical action=lookup
   ```
   - Should show: `vertical_id` (UUID)
   - If missing: Vertical "cleaning" not found in Supabase

   ```
   SUPA_WRITE_ATTEMPT entity=opportunity action=create
   ```
   - Should appear when creating opportunity

   ```
   SUPA_WRITE_SUCCESS route=/leads/cleaning step=opportunity_create
   ```
   - Should show: `supabase_opportunity_id`, `supabase_contact_id`, `ghl_contact_id`

3. **If any step fails, look for:**
   ```
   SUPA_WRITE_FAILED
   ```
   - Check the `error` field for details
   - Full stack trace is included (`exc_info=True`)

### Step 3: Test Job Dispatch (Optional)

1. **Book an appointment** via GHL calendar widget

2. **Search Render logs for:**
   ```
   SUPA_WRITE_ATTEMPT route=/dispatch
   ```
   - Should show: `ghl_opportunity_id`, `external_job_id`, `offer_code`

   ```
   SUPA_WRITE_ATTEMPT route=/dispatch step=opportunity_resolve
   ```
   - Should show: `supabase_opportunity_id` (resolved from GHL ID)

   ```
   SUPA_WRITE_ATTEMPT entity=job action=create
   ```
   - Should appear when creating job

   ```
   SUPA_WRITE_SUCCESS route=/dispatch step=job_create
   ```
   - Should show: `supabase_job_id`, `supabase_opportunity_id`, `ghl_job_id`

## Common Issues & Solutions

### Issue: No `SUPA_WRITE_ATTEMPT` logs appear

**Possible causes:**
1. Code not deployed (check git branch)
2. Import error (check Render startup logs)
3. Code path not executed (check if GHL contact creation succeeded)

**Solution:**
- Check Render service logs for Python import errors
- Verify the code changes are in the deployed branch
- Confirm `/leads/cleaning` endpoint is being hit

### Issue: `config_check` shows `has_url=false` or `has_key=false`

**Possible causes:**
1. Env vars not set in Render
2. Env vars have wrong names
3. Env vars not loaded at runtime

**Solution:**
- Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in Render dashboard
- Check for typos in env var names
- Restart Render service after adding env vars

### Issue: `SUPA_WRITE_FAILED` with `error=mapping_not_found`

**Possible causes:**
1. Opportunity not created in Supabase (check `/leads/cleaning` logs)
2. External mapping not created
3. GHL opportunity_id doesn't match

**Solution:**
- Check if contact/opportunity were created in Supabase
- Verify external_mappings table has the GHL → Supabase mapping
- Check that GHL opportunity_id in dispatch webhook matches the one from lead creation

### Issue: `SUPA_WRITE_FAILED` with HTTP status codes

**Possible causes:**
1. Invalid Supabase URL format
2. Invalid service role key
3. Database schema mismatch
4. RLS policies blocking writes (shouldn't happen with service role key)

**Solution:**
- Verify Supabase URL format: `https://xxx.supabase.co` (no trailing slash)
- Verify service role key is correct (not anon key)
- Check Supabase dashboard for table schema
- Verify service role key has proper permissions

## Log Search Commands

**In Render logs, search for:**
```
SUPA_WRITE
```

**Filter by route:**
```
SUPA_WRITE route=/leads/cleaning
SUPA_WRITE route=/dispatch
```

**Filter by entity:**
```
SUPA_WRITE entity=contact
SUPA_WRITE entity=opportunity
SUPA_WRITE entity=job
```

**Filter by success/failure:**
```
SUPA_WRITE_SUCCESS
SUPA_WRITE_FAILED
```

## Expected Log Flow for Successful Lead Submission

1. `SUPA_WRITE_ATTEMPT route=/leads/cleaning ghl_contact_id=... email=... phone=...`
2. `SUPA_WRITE_ATTEMPT route=/leads/cleaning config_check has_url=true has_key=true`
3. `SUPA_WRITE_ATTEMPT entity=contact action=upsert email=... phone=...`
4. `SUPA_WRITE_SUCCESS entity=contact action=create internal_id=...`
5. `SUPA_WRITE_SUCCESS route=/leads/cleaning step=contact_upsert supabase_contact_id=...`
6. `SUPA_WRITE_ATTEMPT entity=external_mapping source=ghl entity_type=contact`
7. `SUPA_WRITE_SUCCESS entity=external_mapping ...`
8. `SUPA_WRITE_SUCCESS route=/leads/cleaning step=external_mapping_contact`
9. `SUPA_WRITE_ATTEMPT entity=vertical action=lookup slug=cleaning`
10. `SUPA_WRITE_SUCCESS entity=vertical action=lookup slug=cleaning vertical_id=...`
11. `SUPA_WRITE_ATTEMPT entity=opportunity action=create name=... contact_id=...`
12. `SUPA_WRITE_SUCCESS entity=opportunity action=create opportunity_id=...`
13. `SUPA_WRITE_SUCCESS route=/leads/cleaning step=opportunity_create supabase_opportunity_id=...`

If any step is missing, check the previous step's logs for failure reasons.

