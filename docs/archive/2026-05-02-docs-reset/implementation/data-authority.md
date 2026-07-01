# Data Authority & Integration Flow

This document defines which system is authoritative for each entity type and describes the integration flow between Supabase (system of record) and GoHighLevel (legacy/transitional).

## System of Record: Supabase

**Supabase is the authoritative source for:**
- Contacts
- Opportunities
- Jobs
- Schedules (stored in jobs.metadata)
- Payments (Stripe customer IDs stored in contacts.metadata)
- Vendors/Contractors (future: stored in contacts with contact_type='vendor')
- Assignments (future: stored in jobs.metadata or separate table)

**GoHighLevel (GHL) remains temporarily for:**
- Booking UI (embedded calendar widget)
- SMS notifications to contractors
- Legacy workflows (payment triggers, stage transitions)
- Contact custom fields (during transition period)

## Integration Flow

### Phase 1: Supabase-First Writes

All events must write to Supabase FIRST, then optionally sync to GHL for legacy workflows.

#### 1. Lead Creation Flow

**Cleaning Leads:**
1. User submits form → `POST /leads/cleaning` (backend)
2. **Supabase writes (synchronous):**
   - Upsert `contacts` (email-first, phone fallback)
   - Create `opportunities` (linked to contact via `primary_contact_id`)
   - Create `external_mappings` (GHL contact_id → Supabase contact UUID)
   - Create `external_mappings` (GHL opportunity_id → Supabase opportunity UUID)
3. **GHL writes (synchronous, for booking continuity):**
   - Create/update contact in GHL
   - Return GHL `contact_id` for booking widget
4. **GHL writes (background, for legacy workflows):**
   - Upload photos, add tags, create notes

**Gutter Leads:**
1. User submits form → `POST /api/leads/gutters` (Next.js API route)
2. **Supabase writes (synchronous):**
   - Upsert `contacts`
   - Create `opportunities` with `vertical_id`
   - No GHL writes (Supabase-only)

#### 2. Appointment/Booking Flow

**When user books via GHL calendar widget:**
1. GHL creates appointment → webhook fires → `POST /dispatch` (backend)
2. **Supabase writes (synchronous):**
   - Upsert `jobs` (linked to opportunity via `opportunity_id`)
   - Store schedule info in `jobs.metadata`:
     - `start_at` (ISO datetime)
     - `end_at` (ISO datetime)
     - `timezone` (IANA timezone string)
     - `status` (e.g., "scheduled", "completed", "cancelled")
   - Create `external_mappings` (GHL job/appointment_id → Supabase job UUID)
3. **GHL operations (synchronous, for contractor dispatch):**
   - Fetch eligible contractors (tagged contacts)
   - Send SMS notifications
   - Update GHL Job custom objects

#### 3. Payment Flow

**Card Collection:**
1. User enters card → `POST /stripe/setup-intent` (backend)
2. **Supabase writes (via webhook):**
   - Update `contacts.metadata.stripe_customer_id` (when SetupIntent succeeds)
3. **GHL writes (for legacy workflows):**
   - Store `stripe_customer_id` in GHL contact custom field

**Charging:**
1. GHL workflow triggers → `POST /stripe/charge` (backend)
2. **Supabase reads:**
   - Read `stripe_customer_id` from `contacts.metadata` (or GHL fallback)
3. **Stripe operations:**
   - Create PaymentIntent
   - Charge customer
4. **Supabase writes (future):**
   - Create payment records in `payments` table (Phase 2)

## External Mappings

The `external_mappings` table links GHL IDs to Supabase UUIDs:

- **Source:** Always `'ghl'` for GoHighLevel
- **Entity Types:** `'contact'`, `'opportunity'`, `'job'`
- **Internal Tables:** `'contacts'`, `'opportunities'`, `'jobs'`
- **Purpose:** Bidirectional lookup (GHL ID → Supabase UUID, Supabase UUID → GHL ID)

## Idempotency

All Supabase writes are idempotent:
- **Contacts:** Upsert by email/phone (no duplicates)
- **Opportunities:** Upsert via `external_mappings` lookup
- **Jobs:** Upsert via `external_mappings` lookup
- **External Mappings:** Upsert via unique index on `(source, entity_type, external_id, internal_table)`

## Future Multi-Tenant Support

Current design is single-tenant but prepared for multi-tenant:
- No `org_id` columns yet (can be added later)
- All queries can be filtered by `org_id` when added
- RLS policies can be added per-organization

## Migration Path

**Phase 1 (Current):** Supabase-first writes, GHL for UI/workflows
**Phase 2:** Replace GHL booking widget with Supabase-backed calendar
**Phase 3:** Replace GHL SMS with Supabase-backed notifications
**Phase 4:** Remove GHL dependencies entirely

