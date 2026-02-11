# Book V2 — Quote refinement & booking test checklist

Use this checklist to verify the quote refinement → booking flow after implementation.

---

## 1) Modal opens from services/cleaning

- **Steps:** Go to `/services/cleaning`, click **Get a Quote**.
- **Expected:** Quote modal opens (no page navigation). Short form is visible: **First name**, **Last name**, ZIP, Square footage, Cleaning frequency, Email, Phone, “Get my quote”. Home type is **not** on this form (it appears only in Service Details later).

---

## 2) Modal submit → contact, customer, opportunity

- **Steps:** In the modal, fill: **First name**, **Last name**, **Email** (or phone), **ZIP**, **Square footage** bucket → Submit.
- **Expected:**
  - Contact created/updated in Supabase (first_name + last_name).
  - Customer created and linked (or existing linked). Customer name = `{first_name} {last_name}` or email if no name.
  - Opportunity created in pipeline stage **Quote Started** with:
    - Non-empty **name** (e.g. `Jane Smith — Quote` or `user@example.com — Quote`, not blank).
    - **customer_id** set (not null).
  - Redirect to `/book-v2`.

---

## 3) /book-v2 shows Refine quote step first

- **Steps:** After redirect from modal (or with existing `alloy_quote_v1` in storage and no `alloy_quote_refined_v1`).
- **Expected:** “Refine your quote” step appears **before** slot selection. Current one-time pricing is shown (first cleaning price). No slot picker yet.

---

## 4) Select weekly → first + recurring prices

- **Steps:** On Refine step, select **Weekly**.
- **Expected:** UI shows “Updating price…”. Then:
  - **First cleaning** price (one-time / initial deep clean).
  - **Recurring (Weekly)** price per visit.
  - Copy makes it clear first cleaning is initial, recurring is ongoing.

---

## 5) Add-ons → totals persist on refresh

- **Steps:** Toggle 2 add-ons (e.g. Fridge, Oven). Note totals. Refresh the page.
- **Expected:** Totals update when add-ons are toggled. After refresh, same frequency and add-ons are still selected and totals match (persisted in localStorage + opportunity metadata).

---

## 6) Continue to slot selection and complete booking

- **Steps:** Click **Continue to pick time** → choose a slot → confirm time → **fill Service Details** (Address, City, **Home type**, Bedrooms, Bathrooms, Access) → confirm details → enter payment (card) → submit.
- **Expected:**
  - **Home type** is collected and saved only in the Service Details step (not on Get a Quote). It is persisted to the opportunity/job (metadata and confirm payload).
  - Opportunity moves to **Booked** (no duplicate opportunity).
  - No duplicate contact/customer.
  - Job created with correct pricing context (frequency + add-ons from refined quote).
  - Confirm request uses stored IDs (opportunity_id, contact_id, customer_id) and refined quote (quote_subtotal, frequency_label).

---

## 7) Direct /book-v2 (incognito, no storage)

- **Steps:** Open `/book-v2` in incognito (or clear localStorage/sessionStorage).
- **Expected:** **quote_start** step is shown: First name, Last name, ZIP, Square footage, Cleaning frequency, Email, Phone (“Get my quote”). No Home type on this step. No redirect. User can submit to create lead and then see Refine step.

---

## 8) Workflow booking_confirmed

- **Steps:** After a successful booking, ensure a workflow with event **booking_confirmed** and entity **job** is enabled.
- **Expected:** Trigger workflow → a message row is queued and can be processed by `/internal/messages/process` (or your message processor).

---

## Build

- **Command:** `npm run build` (in `web`).
- **Expected:** Build completes with no TypeScript/lint errors.
