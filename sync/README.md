# GHL to Supabase Contact Sync Worker

This sync worker pulls contacts from GoHighLevel (GHL) and upserts them into Supabase. It's designed to be idempotent and safe to run multiple times.

## ⚠️ Security Warning

This worker uses the **Supabase SERVICE ROLE KEY**, which bypasses Row Level Security (RLS). This key should:
- **NEVER** be committed to version control
- **NEVER** be used in client-side code
- **ONLY** be used in secure server-side environments
- Be kept in `.env` file (which is gitignored)

## Setup

### 1. Install Dependencies

```bash
cd sync
pip install -r requirements.txt
```

Or use a virtual environment:

```bash
cd sync
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
# GoHighLevel API Configuration
GHL_API_KEY=your_ghl_api_key_here
GHL_LOCATION_ID=your_ghl_location_id_here
GHL_BASE_URL=https://services.leadconnectorhq.com

# Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Where to find these values:**

- **GHL_API_KEY**: GoHighLevel API key (Bearer token) from your GHL account settings
- **GHL_LOCATION_ID**: Your GHL location ID
- **SUPABASE_URL**: Your Supabase project URL (found in Supabase dashboard → Settings → API)
- **SUPABASE_SERVICE_ROLE_KEY**: Supabase service role key (found in Supabase dashboard → Settings → API → service_role key) ⚠️ Keep this secret!

### 3. Verify Database Schema

Ensure your Supabase database has the following tables:

- **contacts** table with columns:
  - `id` (UUID, primary key)
  - `first_name`, `last_name`, `email`, `phone`
  - `contact_type` (text)
  - `metadata` (jsonb) - stores address, tags, and other extra fields
  - `created_at`, `updated_at` (timestamptz)

- **external_mappings** table with columns:
  - `id` (UUID, primary key)
  - `source` (text) - e.g., 'ghl'
  - `entity_type` (text) - e.g., 'contact'
  - `external_id` (text) - GHL contact ID
  - `internal_table` (text) - e.g., 'contacts'
  - `internal_id` (UUID, references contacts.id)
  - `last_synced_at` (timestamptz)
  - `sync_hash` (text, nullable)
  - `raw` (jsonb) - full GHL contact JSON
  - `created_at` (timestamptz)

#### Required SQL Migration

**One-time setup:** Run this SQL in your Supabase SQL editor to enable upsert functionality:

```sql
-- Create unique index for on_conflict upsert
CREATE UNIQUE INDEX IF NOT EXISTS ux_external_mappings_unique
ON public.external_mappings (source, entity_type, external_id, internal_table);
```

This index allows PostgREST to use `on_conflict` for idempotent upserts.

## Running the Sync

### Basic Usage

From the `sync/` directory:

```bash
python -m src.sync_contacts
```

Or from the repo root:

```bash
python -m sync.src.sync_contacts
```

### What It Does

1. **Fetches all contacts** from GHL for the specified location (with pagination)
2. **Normalizes contact data** (maps GHL field names to our schema)
3. **Upserts into Supabase**:
   - Checks `external_mappings` to see if contact already exists
   - Creates new contact if mapping doesn't exist
   - Updates existing contact if mapping exists
   - Creates/updates `external_mappings` record

### Idempotency

The sync is **idempotent** - you can run it multiple times safely:
- Existing contacts will be updated (not duplicated)
- New contacts will be created
- External mappings are maintained

## Output

The script logs progress and a summary:

```
2024-01-15 10:30:00 - INFO - Starting contact fetch for location_id=abc123
2024-01-15 10:30:01 - INFO - Fetching page 1...
2024-01-15 10:30:02 - INFO - Fetched 100 contacts (total so far: 100)
...
============================================================
SYNC SUMMARY
============================================================
Total contacts fetched from GHL: 523
Successfully upserted: 523
  - Created: 45
  - Updated: 478
Errors: 0
============================================================
```

## Error Handling

- **Rate Limiting (429)**: Automatically retries with exponential backoff
- **Server Errors (5xx)**: Retries with exponential backoff
- **Individual Contact Errors**: Logged but don't stop the sync
- **Configuration Errors**: Exits with clear error message

## Troubleshooting

### "Missing required environment variables"
- Check that your `.env` file exists in the `sync/` directory
- Verify all required variables are set (no empty values)

### "Failed to fetch contacts: 401"
- Verify your `GHL_API_KEY` is correct
- Check that the API key has permissions for the location

### "Error inserting contact"
- Verify your Supabase schema matches expected columns
- Check that `SUPABASE_SERVICE_ROLE_KEY` is correct
- Ensure the `contacts` table exists

### Rate Limiting
- The script automatically handles rate limits with retries
- If you see many 429 errors, GHL may be throttling - wait and retry

## Next Steps

This is step 1 of a backfill/sync. Future enhancements could include:
- Incremental sync (only fetch changed contacts)
- Sync other entities (opportunities, appointments, etc.)
- Webhook-based real-time sync
- Conflict resolution strategies

