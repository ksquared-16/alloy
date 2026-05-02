# Resend delivery / Gmail visibility — investigation (read-only notes)

Purpose: reconcile **`communication_messages.status = sent`** + **`provider_message_id`** set with symptoms like **“only one mail visible in Gmail”**, and clarify what Alloy actually guarantees today.

Evidence sources in repo:

- `backend/app/services/communication_message_sender.py` (email branch)
- `backend/app/integrations/resend_client.py` (`send_resend_email`)
- `docs/implementation/communications/resend-outbound-smoke-test.md`

---

## 1. Exact `from_email` resolution (outbound canonical email)

**Code path (email outbound after binding is resolved):**

```python
from_email_cfg = str(cfg.get("from_email") or "").strip()
from_email = from_email_cfg or default_from_email()
```

`cfg` is the active row’s **`communication_provider_bindings.config`** JSON (not decrypted secrets).

**`default_from_email()`** (`resend_client.py`):

```python
return (os.getenv("RESEND_FROM_EMAIL") or "").strip()
```

**Order:**

1. **`config.from_email`** on the binding, if present and non-empty after trim (**wins over env**).
2. Else **`RESEND_FROM_EMAIL`** on the worker host (e.g. Render).
3. If both are empty, `send_resend_email` raises **`RuntimeError("Resend from address missing")`** (send never completes).

So for your scenario: **`config.from_email = no-reply@kurzmancapital.com`** means **every send uses that address**, regardless of changing **`RESEND_FROM_EMAIL`** on Render, until you clear binding `from_email` or change it.

---

## 2. Exact Resend payload shape currently sent

`POST https://api.resend.com/emails` with headers:

- `Authorization: Bearer <api_key>`
- `Content-Type: application/json`

JSON body (**always**):

- **`from`**: resolved `from_email` (string)
- **`to`**: `[to_email.strip()]` — single-address array
- **`subject`**: subject string, or **`"(no subject)"`** if empty after strip
- **`text`** *or* **`html`**:
  - If binding `config.html` is truthy → **`html`** = `str(config.html)`
  - Else **`text`** = outbound message body (`text_body`)

No `bcc`/`cc`/reply domain handling in `resend_client.py` today.

---

## 3. What `provider_message_id` means in Alloy today

Worker sets **`provider_message_id`** from the **`id`** returned in the **successful JSON response** from Resend **`POST /emails`** (`resend_client.send_resend_email` → `"id"`).

Alloy immediately patches **`communication_messages.status = 'sent'`** and emits **`message_sent`** to **`workflow_events`**.

**Semantics:** This is **“Resend accepted the send request and returned an email resource id.”**  
It does **not** mean:

- Guaranteed Gmail inbox placement
- SMTP handoff completion to recipient MX
- “Delivered” in the RFC sense

Resend exposes **lifecycle** separately (retrieve email / webhooks — see §4). Alloy does **not** currently implement Resend delivery webhooks or poll `GET /emails/{id}` in the worker.

---

## 4. Query Resend for status using `provider_message_id`

Resend documented API: **[Retrieve Sent Email](https://resend.com/docs/api-reference/emails/retrieve-email)**

```bash
# Use the same secret as your binding (typically Render RESEND_API_KEY if secret_ref env:RESEND_API_KEY).
curl -sS -X GET "https://api.resend.com/emails/d72bb69c-1f0c-4362-9827-784920335e56" \
  -H "Authorization: Bearer ${RESEND_API_KEY}"
```

Inspect the JSON for fields such as **`last_event`** (and any other lifecycle fields present in current API revision) to see Resend-side state (e.g. delivered vs bounced vs delayed).

Repeat for additional message ids missing from Gmail to compare.

---

## 5. Store more delivery data in `metadata`?

**Today:** Alloy stores **not** Resend response body columns beyond **`provider_message_id`**; **`message_sent`** event payload mirrors that.

**If you want “delivered / bounced” in Alloy:** persist Resend webhook events or periodically poll **`GET /emails/{id}`** and PATCH **`communication_messages`** (and/or **`metadata`**) — **design work**, not in current code.

**Recommendation for debugging only:** Logging **`from`**, **`to`**, Resend **`id`** (tail), and **`last_event`** from a manual `curl` GET is usually enough before schema changes.

---

## 6. UI/API: “sent to provider” vs “delivered”

**Honest labeling with current backend:**

- Rows with **`provider_message_id`** and **`status = sent`** = **queued through worker and accepted by Resend** (“sent to provider” / **provider accepted**).
- **Delivered** should **not** be claimed until populated from Resend **`last_event`/webhooks** (or equivalent) and stored on the row/event model.

Otherwise operators will mis-blame Alloy when Gmail filters or delays after Resend accepts.

---

## 7. Why “only first email” in Gmail (likely causes checklist)

Ordered from **most plausible** operational causes to investigate:

1. **Gmail UI threading** — same **From** + **Subject** (e.g. `"Test"`) often lands in **one conversation**; open the thread / “N messages” to see duplicates.
2. **Spam / Promotions / Filters** — later messages routed differently despite same nominal recipient.
3. **Resend / recipient provider** — use **`GET /emails/{id}`** per message id per §4; bounce/deferral shows **before** blaming Alloy UI.
4. **Sender/domain alignment** — `no-reply@kurzmancapital.com` must be verified in Resend and pass SPF/DMARC aligned with sending domain to reduce suppression; wrong or mixed identity can cause inconsistent inbox behavior (not strictly “second message dropped” but worth fixing).

---

## 8. Recommended fix if binding `from_email` vs env mismatch is suspected

**If you intend Render `RESEND_FROM_EMAIL` to be the From address:**

1. **`UPDATE communication_provider_bindings`** for that org/channel: **`config`** → remove **`from_email`** or set **`from_email`** explicitly to the **verified domain address** Resend expects; **never** orphan host env from binding config without knowing which wins.

**If binding From is intentional:**

2. Align **`RESEND_FROM_EMAIL`** for **fallback-only** sanity (least surprise when someone clears `config.from_email`).

**No Alloy code changes required for resolution order** unless product wants **`RESEND_FROM_EMAIL` to override binding** — that would be an explicit doctrine change.

---

## 9. Tiny optional diagnostic improvement (acceptable scope)

Increase log detail on successful Resend send (no secrets):

- **`from`** (effective), **`to`**, **`subject`** (short), **`id`** tail.

Today only id tail is logged in `send_resend_email`. Implement only if still blocked after **`GET /emails/{id}`** and Gmail inspection.
