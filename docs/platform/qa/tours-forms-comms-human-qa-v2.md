# Tours, Public Forms & Communications — Human QA V2

For the Director. Every route, label and button below was read from the implementation; the parts marked
*verified in a browser* were also driven end to end by the engineer before handover. Each test ends with
**PASS if …**. Record each result with the PASS / FAIL / BLOCKED / NOT RUN buttons under it, then use
**Download results** at the top.

> Do not paste real family names, phone numbers or emails into notes. Use `+tag` addresses you own
> (e.g. `you+tqa1@…`). Never put a token-bearing link (anything containing `/tours/…` or `/forms/embed/…`)
> into the notes or evidence fields — write "hosted link copied" instead.

## Where to run what

| Environment | What it is | Use it for |
|---|---|---|
| **QA preview** (the site serving this guide) | This candidate's exact build on the Mac mini, against an **isolated database** (synthetic Northwind tenant). No messaging providers are connected, so nothing reaches a real inbox or phone. | Parts A–G and I. It is the **only** place the new **Marketing consent** question exists until the Director approves a release. |
| **Staging** — [https://staging.workwithalloy.com](https://staging.workwithalloy.com) | Deployed `bce2364ab` (PR #1613) on the hosted staging database, with real email/SMS providers. | Part H only (actual provider delivery), with your own address and phone. The Marketing consent *question* is not on staging yet; Part H uses the tour calendar's built-in "Stay in touch" boxes, which are. |

Links in this guide that start with `/` open in the same site as this guide (the QA preview).

**Signing in on the QA preview:** use the QA operator for the isolated tenant (`qa.operator@northwind.invalid`).
Its password is generated per environment and is never written in this guide — ask the engineer for the
one-time handoff, or read it from the environment's secret file on the Mac mini yourself.

---

## A. Organization and location setup

**A1. DO** — Open [Organization › Locations](/organization/locations) and select your test location. Read the
location's identity (name, address, **Time zone**).
**EXPECT** — The location page opens with its tabs, including **Tours**. If Time zone reads **Not set**, use
**Edit location › Time zone** and choose the school's zone, then save. (The Northwind seed has no time zone;
tour scheduling and the operating calendar refuse to work until it is set — that is correct, fail-closed.)

**A2. DO** — Open the location's **Tours** tab → **Booking experience**. Under **School identity** set Display
name `QA School`, a logo URL you own, and under **Brand colour** type `#1F6FEB`. Watch the **Preview — booking
page** on the right. Click **Save booking experience**.
**EXPECT** — Each field says *set for this location*; the preview header shows **QA School** and buttons in the
blue with readable text (the contrast line reads ≥ 4.5:1).

**A3. DO** — Open [Organization › Tours](/organization/tours) (organization-wide defaults) → **Booking
experience**. Set an organization Display name `QA Org` and leave the colour empty.
**EXPECT** — Back on the location's Booking experience, the location's own values still win (*set for this
location*); fields you clear at the location fall back to *the organization's Booking experience* (`QA Org`).

**A4. DO** — On the location's Booking experience click **Use the organization's settings**, then **Save
booking experience**.
**EXPECT** — Every field now reads *the organization's Booking experience* or *Alloy default*, and the preview
shows `QA Org`. Re-apply A2 afterwards for the rest of this guide.

**A5. DO** — After Part E publishes the calendar, open the **Hosted booking page** in a private window.
**EXPECT** — Families see exactly the name and colour the **Preview & Share** panel names under *Families
see "…" (…) in #… (…)*. If the published form sets its own branding, the form's wins — the panel says so.

## B. Tour scheduling

**B1. DO** — Location → **Tours** → **Availability** → **Add a schedule for <location>**. Name `QA Weekdays`,
select **Mon–Fri**, set the first window **9:00 AM – 11:00 AM**, click **Add another time window** and set
**1:00 PM – 3:00 PM**. **Tour length (minutes)** `30`, **Gap between tours (minutes)** `15`, **Families per
time** `2`. Read the line *"Each selected day offers N tour times: … — M a week."* Click **Create schedule**.
**EXPECT** — One `QA Weekdays` card, Mon–Fri dark, both windows on one line in **AM/PM** form with the time zone,
and *"30 minute tours · 15 minute buffer · up to 2 …"*.

**B2. DO** — On the card click **Duplicate**. Rename the copy `QA Weekdays (copy)` and save.
**EXPECT** — Two cards; editing the copy does not change the original.

**B3. DO** — Open [Organization › Tours](/organization/tours) → **Availability** and look at the location's page
blue box.
**EXPECT** — Inheritance is additive: the location offers its own schedules **plus** every organization-wide
schedule. Organization-wide cards on the location page only offer **Copy to this location** (no Edit/Delete).

**B4. DO** — Deactivate the copy (**Edit** → untick **Active** → **Save schedule**). Open the Hosted booking page
(after Part E) and look at a weekday.
**EXPECT** — Times are 30 minutes long, 15 minutes apart (the gap), each offered once, in AM/PM, in the
location's time zone; the inactive copy contributes nothing.

## C. Holidays and closures

**C1. DO** — Location page → **Operating calendar**. Add a **Holiday** on a weekday next week. Read the impact
preview before you save, then **Save**.
**EXPECT** — The preview lists any existing tour bookings that fall in the holiday; after saving the notice
reads *"Saved. Nothing was sent to families, and existing bookings were not changed."* The holiday shows no tour
times on the booking page.

**C2. DO** — Add **Closed all day** on another weekday. Then **Closed part of the day** (e.g. 1:00 PM – 2:00 PM)
on a third weekday, and **Modified hours** (e.g. 9:00 AM – 10:00 AM) on a fourth.
**EXPECT** — On the booking page: the full closure offers nothing; the partial closure removes only the times
that overlap it; modified hours keep only the times inside them.

**C3. DO** — Book a tour time (Part F) on a day, then add a closure covering it.
**EXPECT** — The impact preview names that booking as newly affected; after saving, the booking still exists
(nothing is silently cancelled, nothing is sent).

**C4. DO** — **Reopen** the full-day closure from C2.
**EXPECT** — That day's eligible times return on the booking page; the preview names bookings that no longer
need attention.

## D. Forms Studio — inquiry form with the Marketing consent question

**D1. DO** — Sidebar **Processing** → **Studio** → **Forms**. Open the location's public inquiry form (or create
one). Make sure it has parent first name, last name, email and phone, and a child first name and date of birth.
**EXPECT** — The form opens in **Edit** with its sections on the canvas.

**D2. DO** — At the bottom of a section click **+ Add question**. In the panel, under **Answer types** →
**Capture**, choose **Marketing consent**.
**EXPECT** — A question titled **Stay in touch (optional)** appears on the canvas showing two unchecked boxes
(email and text) with Alloy's default wording. Its tag reads **Marketing consent · Optional**. *Verified in a
browser.*

**D3. DO** — With the question selected, read the right-hand inspector.
**EXPECT** — No **Required** box (it says *Always optional*), no **Store answer in**, a **Marketing consent**
group with **Ask about marketing email** / **Ask about marketing texts (SMS)**, a wording box per channel, the
explanation of where the answer is recorded, and a **Wording version** line.

**D4. DO** — Change the label to `Hear from QA School`, the note to `Optional — we'll answer your inquiry
either way.` and the email wording to `Email me QA School news and events. I can unsubscribe at any time.`
Leave the SMS wording empty.
**EXPECT** — The canvas shows your email wording and Alloy's default SMS wording (which keeps "Reply STOP to opt
out"). The **Wording version** changes when you change any wording.

**D5. DO** — Untick **Ask about marketing texts (SMS)**, then try to untick email too.
**EXPECT** — SMS disappears from the canvas; email cannot be unticked while it is the only channel. Re-tick SMS.

**D6. DO** — Drag the question between two others (or use **Move earlier / Move later**). Click **+ Add question**
→ **Marketing consent** again.
**EXPECT** — The question sits where you placed it. Adding it a second time does not create a second one — it
selects the existing question.

**D7. DO** — Search the field library (in the same panel) for `opt-in`.
**EXPECT** — The legacy person fields **Email opt-in** / **SMS opt-in** are not offered (they were stored where no
send reads them). Forms that already contain them still open and render.

**D8. DO** — Set the form's **Branding** colour and the submit button text (e.g. `Send my inquiry`). Toggle
**Preview** at the top right.
**EXPECT** — Preview shows the consent question in the same place, with your wording, both boxes unchecked and
clickable; paired fields sit side by side as in Edit; the submit button shows your text in the brand colour.

**D9. DO** — **Save draft**, then **Publish**.
**EXPECT** — The form publishes a new version. Open its hosted link in a private window: the consent question
renders exactly as in Preview.

**D10. DO** — In Edit, change the email wording again and **Save draft** only — do not publish. Reload the hosted
link.
**EXPECT** — Families still see the previously published wording. Publish (or **Distribution → Republish
version**) to make the new wording live; the hosted link then shows it.

## E. Marketing website installation

### Tour-first — the calendar leads into the inquiry form

**E1. DO** — Location → **Tours** → **Preview & Share**. On the location's inquiry link (the form from Part D)
click **Publish tour calendar here**.
**EXPECT** — The panel reads **Tour calendar is live — Published** with rows **Hosted booking page** (Open /
Copy), **Embed on your website (iframe)** (Copy) and **Button for your website** (Copy), and *"Step 2 is the form
"…""* names your form. *Which form the calendar opens into is decided by the link you publish it on.*

**E2. DO** — Click **Copy** on the iframe row. In a text editor create `tour-test.html` containing
`<!doctype html><html><body><h1>Come visit QA School</h1>PASTE-THE-IFRAME-HERE</body></html>`, replace
`PASTE-THE-IFRAME-HERE` with the copied iframe, save, and open the file in Chrome (a different origin from Alloy).
**EXPECT** — The calendar renders inside your page with your heading around it and your brand. (If the link lists
allowed embed origins, it only loads on those sites — the panel says which.)

**E3. DO** — In the framed calendar pick a day and time, then **Continue**.
**EXPECT** — Step 2 opens inside the same frame with a **Requested tour** box ("not confirmed until the school
reviews your request") and your inquiry form, including **Hear from QA School** — and **no** second "Stay in
touch" box (the form's question replaces the default one).

**E4. DO** — Repeat E3 on a phone, or Chrome DevTools at 390 px wide.
**EXPECT** — Fields stack in one column, buttons are full width, nothing is cut off. Note: the iframe has a fixed
minimum height and does not resize itself — a long form scrolls inside the frame (known limitation).

### Form-first — the inquiry form on its own

**E5. DO** — Studio → Forms → your form → **Distribution**. Copy the hosted link and the iframe (**Copy iframe**).
Paste it into `form-test.html` (same one-line page as E2) and open it.
**EXPECT** — The form renders in your page with the consent question; this works without any tour calendar
because the form itself asks the question.

**E6. DO** — Submit the framed form with `you+tqa-form@…` and tick only the **email** box.
**EXPECT** — A confirmation that your request was received; a new Processing case appears (Part F, F2).

### For Firefly's website administrator

**E7. DO** — Read and confirm these instructions are what you would send:
1. In Alloy: Organization › Locations › *Firefly location* › Tours › Preview & Share → **Publish tour calendar
   here** on the Firefly inquiry link → **Copy** on **Embed on your website (iframe)**.
2. On the website: paste that snippet into an HTML/"Custom code" block on the page where families should book
   (e.g. "Schedule a tour"). Nothing else is needed — no script, no API key.
3. What families see after picking a time is the form on that inquiry link; to change the form, edit and
   republish it in Studio (Part D). To change times, edit Availability (Part B). To change name/colour, Booking
   experience (Part A).
4. To restrict which websites may frame it, add the site to the link's allowed embed origins.
**EXPECT** — The instructions match what Parts A–E showed. *Nothing has been installed on Firefly's real website —
that needs the Director's explicit authorization and the site administrator.*

## F. Public inquiry and lead approval

**F1. DO** — In the framed calendar (E3) fill the form with `you+tqa1@…`, tick nothing under **Hear from QA
School**, and submit.
**EXPECT** — *Your tour request was received … This time is not confirmed yet.* No confirmation email, reminder or
invite is created.

**F2. DO** — Sidebar **Processing** → **Work**. Open the newest case for `you+tqa1@…`.
**EXPECT** — A **Requested tour** panel with the day, time and location you picked, and *"Nothing is booked and
nothing has been sent to the family yet."*

**F3. DO** — Click **Approve — Create enrollment lead**.
**EXPECT** — The case completes; the person, family, child and lead are created (or resolved); the tour is
booked (or, if the schedule requires staff approval, *pending approval*); a confirmation is enqueued only for an
approved booking.

**F4. DO** — Submit a new request for a time, then before approving make that time unavailable (deactivate the
schedule or add a closure), and Approve.
**EXPECT** — **Lead accepted — tour needs rescheduling** with current openings; no booking at the gone time.

**F5. DO** — Approve the same case again (reload and click Approve if offered).
**EXPECT** — Nothing is duplicated: one lead, one booking, one confirmation.

## G. Communications consent and opt-out

Use a new `+tag` address per scenario. Consent is shown on the **case** ("what the family answered, under which
wording, and what Approve did") and on the **person** (open the person from the case's linked records →
**Household card → Communication preferences**: state, *Set by … · date · wording …*, eligibility *Can be sent
now* / *Will not be sent — …*, and history).

**G1. DO** — Form-first form: submit with **no** box ticked; Approve.
**EXPECT** — Case: the family answered no on both channels → *Nothing recorded*. Person: *No consent on record*
for marketing email and SMS.

**G2. DO** — Submit with **email** ticked only; Approve.
**EXPECT** — Case shows your exact email wording and its version; person: email marketing **opted in**
(*Set by public intake · … · wording form_field.v1:…*); SMS marketing unchanged.

**G3. DO** — Submit with **SMS** ticked only; Approve.
**EXPECT** — SMS marketing **opted in**; email marketing unchanged.

**G4. DO** — Submit with **both** ticked; Approve.
**EXPECT** — Both opted in, each with its own wording on the case.

**G5. DO** — On the G2 person set email marketing to **opted out**. Submit a new inquiry with the same email
ticking email again; Approve (Review matches → *Link existing* if asked).
**EXPECT** — Email marketing stays **opted out**; history reads *asked to opt in — opt-out kept*; the case says
*Not applied — the opt-out stands*.

**G6. DO** — Same as G5 for SMS on the G3 person.
**EXPECT** — SMS marketing stays **opted out**.

**G7. DO** — Look at the G5 / G6 cases again.
**EXPECT** — Each repeat inquiry's evidence is on its case; nothing on the person moved from opted out.

**G8. DO** — Open any G2–G4 case.
**EXPECT** — Consent evidence visible: what was answered, the exact wording, its version, and what Approve did.

**G9. DO** — Open the G4 person's Communication preferences history.
**EXPECT** — Each channel's history names the inquiry as the source with its date.

**G10. DO** — For the G1 person (no consent), try a marketing email from the person's record.
**EXPECT** — Eligibility reads *Will not be sent — …* (marketing requires opt-in); nothing is enqueued for
delivery.

**G11. DO** — Same for a marketing SMS to the G1 person.
**EXPECT** — Blocked the same way.

**G12. DO** — On staging (Part H) use the unsubscribe link in a delivered marketing email. On the QA preview
there is no email provider, so this is tested in H2.
**EXPECT** — Recorded under H2.

**G13. DO** — After G5's opt-out, try another marketing email to that person.
**EXPECT** — Suppressed — nothing deliverable is created.

**G14. DO** — (Engineer-verified API contract) a direct send to a suppressed recipient.
**EXPECT** — The response is **409** with `recipient_suppressed` naming the blocked message — never a 500. In the
browser: a clear "will not be sent" message, not a server error.

**G15. DO** — Approve a tour request whose family ticked nothing.
**EXPECT** — The tour confirmation (transactional) still follows the approval rules regardless of marketing
consent; no marketing message is created by submitting or approving.

**G16. DO** — Note only: legacy workflow SMS (`create_message`) cannot bypass suppression.
**EXPECT** — Certified in #1613 (dispatch refuses legacy rows without an eligibility record). Mark PASS if you
accept that evidence, NOT RUN otherwise.

**G17. DO** — Note only: scheduled messages are re-checked at dispatch.
**EXPECT** — Certified in #1613 (a send scheduled while opted in is refused after opt-out). Mark as for G16.

## H. Actual provider delivery (staging, your own address and phone only)

> Only send to an email address and phone you own. Never to a family. Staging uses the real providers.
> The engineer did **not** send any real message; these steps are yours.

**H1. DO** — On [staging](https://staging.workwithalloy.com), publish a test location's tour calendar (Part E on
staging), book a time with `you+tqa-h@…` and your phone, tick **both** "Stay in touch" boxes, and Approve.
**EXPECT** — Your person shows email and SMS marketing opted in; the tour confirmation arrives in your inbox.

**H2. DO** — Send that person a legitimate marketing email from the record. Open it; click **Unsubscribe**, then
confirm.
**EXPECT** — The email arrives with an unsubscribe link; after confirming, email marketing reads **opted out**
(source: recipient unsubscribe) and SMS marketing is unchanged.

**H3. DO** — Send a legitimate marketing SMS to your phone.
**EXPECT** — It arrives.

**H4. DO** — Reply **STOP** to that SMS.
**EXPECT** — SMS is suppressed for your number; the person's SMS marketing reads opted out / suppressed.

**H5. DO** — Try one more marketing email and one more marketing SMS.
**EXPECT** — Both are refused before any provider is called (*Will not be sent — …*); nothing arrives.

**H6. DO** — Re-consent only through the authorized preference flow (staff **Communication preferences** with
the family's documented request), never by re-submitting a form.
**EXPECT** — A repeat inquiry does not re-enable the opt-out (G5); only the authorized change does.

## I. Negative paths and cleanup

**I1. DO** — Open `/tours/invalid` and `/forms/embed/invalid`.
**EXPECT** — A clear "this link isn't available" page; nothing leaks about any school.

**I2. DO** — Submit the same inquiry twice quickly (double-click submit).
**EXPECT** — One submission, one case.

**I3. DO** — Pick the last free spot of a time in two browser windows; submit both.
**EXPECT** — One request holds it; the other is told *"That time is no longer available. Please choose another
time."* with answers kept.

**I4. DO** — While on step 2, have a colleague add a closure over your selected time; submit.
**EXPECT** — Same "no longer available" message; nothing booked.

**I5. DO** — Submit as a family that already exists (same email) and approve.
**EXPECT** — **Review matches** appears; *Link existing* resolves to the existing person — no duplicate person.

**I6. DO** — Open an unsubscribe link with its token altered (staging, H2 email).
**EXPECT** — Refused; no preference changes.

**I7. DO** — Wrong location: open a location's booking page and confirm the times and brand are that location's.
**EXPECT** — Another location's schedules or closures never appear.

**I8. DO** — Clean up the QA preview: **Withdraw calendar**, delete `QA Weekdays` and its copy, remove the
operating-calendar test entries, **Use the organization's settings** on Booking experience, archive the QA
persons/leads and cancel their tours from the person's tour card. Delete `tour-test.html` and `form-test.html`.
On staging, undo H1–H6 the same way.
**EXPECT** — No QA schedule, closure, published calendar or QA person remains. (The QA preview database is
discarded when the environment is retired.)

---

## Known limitations

- The Marketing consent question is on this candidate only; staging gets it after a Director-approved release.
- The QA preview has no email/SMS providers: Parts G10–G13 prove refusal and suppression there; delivery and
  unsubscribe-by-email are Part H on staging.
- The tour iframe has a fixed minimum height and does not auto-resize.
- Public pages send no `frame-ancestors` header; the allowed-embed-origins check uses the Origin/Referer the
  browser sends. Owner: Platform security.
- Organization-wide Tours settings are reached from the location's Tours tab link or `/organization/tours`; there
  is no separate sidebar entry.
- There is no safe-recipient allowlist for provider testing on staging (only two QA organizations are blocked
  outright). Owner: Communications.
