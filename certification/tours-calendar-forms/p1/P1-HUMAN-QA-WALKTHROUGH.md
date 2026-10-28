# Tours & Public Forms — Human QA walkthrough (P1 polish)

For the Director, on **hosted staging** (`https://staging.workwithalloy.com`) **after** the P1 candidate is
deployed there. Every route, label and button named here was read from the implementation and seen in a
browser on 2026-10-27; nothing is invented. Do the steps in order. Each step ends with **PASS if …**.

Use a private/incognito window for the family steps (§E), so you are not signed in as staff there.

---

## A. Before you start

1. Sign in to staging as an administrator with tour configuration and forms authoring access.
   **PASS if** the left sidebar shows **Processing** and you can open **Organization › Locations**.
2. Pick a test school. The examples use **South Campus** (it already has its own Monday window, and
   the organization has duplicate Monday windows — the case you reported).
3. Have an email address you can read, written as `you+tourqa1@…` (a `+tag` keeps QA records easy to
   find and remove).

## B. Tour schedules — where they live

4. Go to **`/organization/locations`**, select **South Campus**, then the **Tours** tab.
   **PASS if** you see three tabs — **Availability · Booking experience · Preview & Share** — and **no**
   "Week at a glance" list.
5. On **Availability**, read the blue box. It says how many schedules are *set here* and how many are
   *organization-wide*. **PASS if** it reads "Families booking at South Campus see the times from 1 schedule
   set here plus 4 organization-wide schedules" (numbers may differ if data changed).
6. Under **Schedules set for South Campus**, each schedule appears **once**: weekday chips (Mon … Sun, the
   selected ones dark) and all of its time windows on one line.
   **PASS if** Monday 10:00 AM – 12:00 PM appears once, with Edit / Duplicate / Deactivate / Delete.
   *(Deactivate appears on the older single-window rules staging has today. A schedule created with
   **Add a schedule** is switched off with **Edit** → untick **Active** → **Save schedule**.)*
7. Under **Organization-wide schedules (also offered here)**:
   **PASS if** these cards have **only** "Copy to this location" (no Edit/Delete), and the two identical
   **Monday window 9:00 AM – 12:00 PM** cards each say *Same days and times as "Monday window"*.
   *Why Monday appeared twice:* staging has **two identical organization-wide Monday 9–12 rows**
   (census `p1-tour-rule-presentation-census.sql`). Families never saw a time twice — each time is offered
   once — but the old screen listed each row separately, twice.
8. Click **Edit organization-wide schedules** (or the **Organization › Tours** link in the blue box).
   **PASS if** you land on **`/organization/tours`**, titled **Tours**, with "Configure tours for:
   Organization-wide (all locations)". *This is where organization-wide schedules are configured.*
9. *(Optional cleanup of the real duplicate — your decision.)* On `/organization/tours`, one of the two
   **Monday window** cards can be **Delete**d. Existing bookings are kept. **PASS if** afterwards South
   Campus shows one organization-wide Monday card with no "Same days and times" note.

## C. Configure a schedule (location)

10. Back on **South Campus › Tours › Availability**, click **Add a schedule for South Campus**.
11. Name it `QA Wednesday`, select **Wed**, set one window 1:00 PM – 2:00 PM, Tour length 30, Families
    per time 1, tick **Staff approve each booking**. Read the line under the fields ("Each selected day
    offers 2 tour times …"). Click **Create schedule**.
    **PASS if** a `QA Wednesday` card appears once, with Wed selected and "1:00 PM – 2:00 PM", and badge
    **needs approval**.
12. *Override, as it actually works:* inheritance is **additive**. A location's schedules add to the
    organization's; a location cannot switch an organization-wide time off. To give one school different
    times, add its own schedule (step 11). To stop an organization-wide time somewhere, change or delete it
    on `/organization/tours` — that changes it for every location.
    **PASS if** this matches what the blue box on step 5 told you.

## D. Booking experience (branding and button text)

13. **South Campus › Tours › Booking experience.** Three groups: **School identity** (display name,
    logo), **Brand colour**, **Booking button**; a live **Preview — booking page** on the right.
14. Leave colour empty (it shows `#00A283 (Alloy default)`) and read the note under it.
    **PASS if** it says white text on the exact colour would be hard to read, buttons use a slightly
    deeper shade, and the contrast is **4.6:1 (needs 4.5:1)**; the preview buttons are **white text on a
    deep green** (not black on bright green).
15. Type Display name `South Campus QA`, Button text `Book a Campus Visit`. Watch the preview change, then
    **Save booking experience**.
    **PASS if** the preview heading and the "Website button" both read **Book a Campus Visit**, and each
    field says "set for this location".
16. Try a light colour, e.g. `#FFD400`. **PASS if** the preview keeps the yellow and uses dark
    **olive** text (not black, not white), still ≥ 4.5:1. Clear the colour field again and save, or use
    **Use the organization's settings** to drop all location overrides.

## E. Publish the calendar and get the embed

17. **South Campus › Tours › Preview & Share.** If it says *"South Campus's tour calendar is not
    published"*, it lists South Campus's inquiry form links. Links that are turned off say so.
18. On a usable inquiry link (on staging: **Inquire About KLA Schools of Hillsboro · Marketing Web
    Forms**) click **Publish tour calendar here**.
    **PASS if** the panel now reads **Tour calendar is live — Published** and shows three rows:
    **Hosted booking page** (Open / Copy), **Embed on your website (iframe)** (Copy), **Button for your
    website** (Copy) with a sample button.
19. Click **Copy** on the iframe row. That text is the embed. It looks like
    `<iframe src="https://staging.workwithalloy.com/tours/…" title="Book a Campus Visit — South Campus" …></iframe>`
    — use the copied text, not this example.
20. Make a test "school website": open a text editor, paste
    ```html
    <!doctype html><html><body style="font-family:Georgia;background:#fbf7ef">
    <h1>Come visit our campus</h1>
    PASTE-THE-IFRAME-HERE
    </body></html>
    ```
    save as `tour-test.html` on your desktop and open it in Chrome. (If the link lists allowed embed
    origins, the calendar only loads on those websites — the panel says which.)
    **PASS if** the calendar shows inside the page with your heading and brand.

## F. The family's two-step journey

21. In the framed calendar (or the **Hosted booking page** in an incognito window), pick a day and a time.
    **PASS if** the selected day/time are white on your brand colour, and **Continue** is too.
22. Click **Continue**. **PASS if** step 2 opens **inside the same frame** (your test page stays put),
    with a **Requested tour** box ("not confirmed until the school reviews your request") and the
    inquiry form; on a laptop, First/Last name sit **side by side**.
23. Fill required fields with `you+tourqa1@…`. Under **Stay in touch (optional)**, tick **Email me news…**
    only. Click the submit button.
    **PASS if** you see **Your tour request was received … This time is not confirmed yet**.
24. Check that inbox for 5 minutes. **PASS if** **no** tour confirmation, reminder or calendar invite
    arrives (only an approved tour sends those).
25. Phone check: repeat 21–22 on a phone (or Chrome DevTools at 390 px). **PASS if** fields stack in one
    column, buttons are full width, nothing is cut off.
26. Unavailable time: start the journey, pick a time, and before submitting have a colleague deactivate
    that window (or pick the last free slot twice in two windows). **PASS if** submit says **"That time is
    no longer available. Please choose another time."**, keeps your answers, and offers **Choose another
    time**.

## G. Processing and approval

27. In the staff window: sidebar **Processing** → **Work**. Open the newest case for `you+tourqa1@…`.
    **PASS if** it shows a **Requested tour** panel with the day/time and campus you picked.
28. Review "What Alloy found", then click the **Approve —** button (e.g. *Approve — Create enrollment lead*).
    **PASS if** the case completes, the Requested tour shows as booked, and within minutes the inbox gets
    the **tour confirmation** (with the time in the school's zone).
29. Consent: open the created person (from the case's linked records) → communication preferences.
    **PASS if** email marketing shows **opted in** and SMS marketing **not**. *(Known gap: the consent
    wording/time captured on the form is stored on the case but not shown to staff — Communications backlog.)*
30. Suppression: on that person set email marketing to **opted out**, then try to send them a marketing
    email from the record. **PASS if** nothing is delivered. *(Known defect: the screen may show a
    server error even though suppression worked — Communications backlog. FAIL only if an email arrives.)*

## H. Forms Studio parity

31. Sidebar **Processing** → **Studio** → **Forms**, open the inquiry form. Toggle **Edit** and
    **Preview** at the top right. **PASS if** fields paired side by side in Edit (e.g. First / Last name)
    are side by side in Preview too, with visible input boxes, red `*` on required fields, and the submit
    button in the form's brand colour with readable text.
32. Compare with step 22's form (framed) and the **Hosted booking page** on a laptop. **PASS if** all three
    show the same pairs, order and required marks.

## I. Cleanup

33. **Preview & Share** → **Withdraw calendar** (unless you want it live).
34. **Availability** → delete `QA Wednesday`.
35. **Booking experience** → **Use the organization's settings** → **Save booking experience**.
36. Processing: the QA cases you created are completed by approval; the lead/person created for
    `you+tourqa1@…` can be archived from its record. Cancel the QA tour booking from the person's tour card.
37. Delete `tour-test.html`.

**Not tested by the engineer:** the Firefly production website itself — a controlled external-origin page
(a different origin from the app) stood in for it.
