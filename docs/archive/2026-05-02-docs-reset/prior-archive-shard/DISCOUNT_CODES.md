> **Archived (2026-04):** One-time or superseded material; kept for history. **Current doctrine:** [`docs/architecture/README.md`](../architecture/README.md). Prefer [`docs/README.md`](../README.md) for where everything else lives.

---

# Discount Codes Implementation

## Overview
Discount codes allow customers to apply one-time discounts to their first cleaning booking. Each discount code can only be used once per contact.

## Backend Endpoints

### POST /discounts/validate
Validates a discount code and checks if it can be used by the current contact.

**Request:**
```json
{
  "code": "SAVE25",
  "ghl_contact_id": "optional_ghl_id",
  "email": "customer@example.com",
  "phone": "+1234567890",
  "quote_subtotal": 200.00,
  "vertical_key": "cleaning"
}
```

**Response (valid):**
```json
{
  "valid": true,
  "discount_code_id": "uuid",
  "discount_amount": 25.00,
  "quote_total": 175.00
}
```

**Response (invalid):**
```json
{
  "valid": false,
  "reason": "invalid" | "already_used" | "contact_required"
}
```

### POST /discounts/redeem
Records the discount redemption in Supabase and adds a GHL tag.

**Request:**
```json
{
  "code": "SAVE25",
  "ghl_contact_id": "required_ghl_id",
  "opportunity_id": "optional_uuid",
  "job_id": null,
  "quote_subtotal": 200.00,
  "discount_amount": 25.00,
  "quote_total": 175.00
}
```

**Response:**
```json
{
  "success": true
}
```

**Response (already used):**
```json
{
  "success": false,
  "reason": "already_used"
}
```

## Frontend Integration

### Discount Code Input
Located in the "Your Quote" panel on `/book` page:
- Input field for discount code
- "Apply" button to validate
- Shows discount amount and adjusted total when applied
- "Remove" button to clear discount

### Storage
Discount data is stored in `alloy_booking_prefill` (sessionStorage + localStorage):
```json
{
  "discount_code": "SAVE25",
  "discount_code_id": "uuid",
  "discount_amount": 25.00,
  "quote_total": 175.00
}
```

### Redemption Flow
1. User enters discount code and clicks "Apply"
2. Frontend calls `/discounts/validate`
3. If valid, discount is applied to UI and stored in prefill
4. After lead submission succeeds, frontend calls `/discounts/redeem`
5. Backend records redemption in `discount_redemptions` table
6. Backend adds GHL tag: `discount:SAVE25`

## Database Schema

### discount_codes
- `id` (UUID, primary key)
- `code` (text, unique)
- `percent_off` (numeric, nullable)
- `amount_off` (numeric, nullable)
- `active` (boolean, default true)
- `created_at`, `updated_at`

### discount_redemptions
- `id` (UUID, primary key)
- `discount_code_id` (UUID, FK to discount_codes)
- `discount_code` (text, denormalized)
- `contact_id` (UUID, FK to contacts)
- `opportunity_id` (UUID, FK to opportunities, nullable)
- `job_id` (UUID, FK to jobs, nullable)
- `quote_subtotal` (numeric)
- `discount_amount` (numeric)
- `quote_total` (numeric)
- `created_at`
- **UNIQUE constraint:** `(contact_id, discount_code_id)` - ensures one redemption per contact per code

## Testing

### Manual Test Steps
1. Create a discount code in Supabase:
   ```sql
   INSERT INTO discount_codes (code, percent_off, active)
   VALUES ('TEST25', 25, true);
   ```

2. Submit a cleaning quote form
3. Navigate to `/book` page
4. Enter discount code "TEST25" in the quote panel
5. Click "Apply"
6. Verify discount is applied (price shows discount)
7. Complete booking flow
8. Verify redemption recorded in `discount_redemptions`
9. Verify GHL tag `discount:TEST25` added to contact

### cURL Examples

**Validate discount:**
```bash
curl -X POST http://localhost:8000/discounts/validate \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST25",
    "email": "test@example.com",
    "quote_subtotal": 200.00,
    "vertical_key": "cleaning"
  }'
```

**Redeem discount:**
```bash
curl -X POST http://localhost:8000/discounts/redeem \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST25",
    "ghl_contact_id": "contact_id_here",
    "quote_subtotal": 200.00,
    "discount_amount": 50.00,
    "quote_total": 150.00
  }'
```

## Notes
- Discount applies ONLY to first cleaning (one-time per contact)
- If user selects recurring, discount applies only to initial booking
- Discount validation requires contact_id (email or phone must be provided)
- Redemption is idempotent (UNIQUE constraint prevents duplicates)
- GHL tag format: `discount:<CODE>` (uppercase)

