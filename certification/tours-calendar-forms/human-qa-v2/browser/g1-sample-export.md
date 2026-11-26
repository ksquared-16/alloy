# Tours, Public Forms & Communications — Human QA V2 results

- Guide: `docs/platform/qa/tours-forms-comms-human-qa-v2.md` · version `a166ca416bac`
- Tester: (not set)
- Exported: 2026-10-28T22:58:42.235Z
- Where: https://vacilandos-mac-mini.tail2aa1af.ts.net:4412
- Summary: PASS 1 · FAIL 1 · BLOCKED 0 · NOT RUN 64 (of 66)

| Test | Status | Section | What | Note | Evidence |
|---|---|---|---|---|---|
| A1 | PASS | A. Organization and location setup | Open Organization › Locations and select your test location. Read the location's identity (name, address, T… |  |  |
| A2 | NOT RUN | A. Organization and location setup | Open the location's Tours tab → Booking experience. Under School identity set Display name QA School, a log… |  |  |
| A3 | NOT RUN | A. Organization and location setup | Open Organization › Tours (organization-wide defaults) → Booking experience. Set an organization Display na… |  |  |
| A4 | NOT RUN | A. Organization and location setup | On the location's Booking experience click Use the organization's settings, then Save booking experience. |  |  |
| A5 | NOT RUN | A. Organization and location setup | After Part E publishes the calendar, open the Hosted booking page in a private window. |  |  |
| B1 | NOT RUN | B. Tour scheduling | Location → Tours → Availability → Add a schedule for <location>. Name QA Weekdays, select Mon–Fri, set the … |  |  |
| B2 | NOT RUN | B. Tour scheduling | On the card click Duplicate. Rename the copy QA Weekdays (copy) and save. |  |  |
| B3 | NOT RUN | B. Tour scheduling | Open Organization › Tours → Availability and look at the location's page blue box. |  |  |
| B4 | NOT RUN | B. Tour scheduling | Deactivate the copy (Edit → untick Active → Save schedule). Open the Hosted booking page (after Part E) and… |  |  |
| C1 | NOT RUN | C. Holidays and closures | Location page → Operating calendar. Add a Holiday on a weekday next week. Read the impact preview before yo… |  |  |
| C2 | NOT RUN | C. Holidays and closures | Add Closed all day on another weekday. Then Closed part of the day (e.g. 1:00 PM – 2:00 PM) on a third week… |  |  |
| C3 | NOT RUN | C. Holidays and closures | Book a tour time (Part F) on a day, then add a closure covering it. |  |  |
| C4 | NOT RUN | C. Holidays and closures | Reopen the full-day closure from C2. |  |  |
| D1 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Sidebar Processing → Studio → Forms. Open the location's public inquiry form (or create one). Make sure it … |  |  |
| D2 | FAIL | D. Forms Studio — inquiry form with the Marketing consent question | At the bottom of a section click + Add question. In the panel, under Answer types → Capture, choose Marketi… | sample note |  |
| D3 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | With the question selected, read the right-hand inspector. |  |  |
| D4 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Change the label to Hear from QA School, the note to Optional — we'll answer your inquiry either way. and t… |  |  |
| D5 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Untick Ask about marketing texts (SMS), then try to untick email too. |  |  |
| D6 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Drag the question between two others (or use Move earlier / Move later). Click + Add question → Marketing c… |  |  |
| D7 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Search the field library (in the same panel) for opt-in. |  |  |
| D8 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Set the form's Branding colour and the submit button text (e.g. Send my inquiry). Toggle Preview at the top… |  |  |
| D9 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | Save draft, then Publish. |  |  |
| D10 | NOT RUN | D. Forms Studio — inquiry form with the Marketing consent question | In Edit, change the email wording again and Save draft only — do not publish. Reload the hosted link. |  |  |
| E1 | NOT RUN | E. Marketing website installation | Location → Tours → Preview & Share. On the location's inquiry link (the form from Part D) click Publish tou… |  |  |
| E2 | NOT RUN | E. Marketing website installation | Click Copy on the iframe row. In a text editor create tour-test.html containing <!doctype html><html><body>… |  |  |
| E3 | NOT RUN | E. Marketing website installation | In the framed calendar pick a day and time, then Continue. |  |  |
| E4 | NOT RUN | E. Marketing website installation | Repeat E3 on a phone, or Chrome DevTools at 390 px wide. |  |  |
| E5 | NOT RUN | E. Marketing website installation | Studio → Forms → your form → Distribution. Copy the hosted link and the iframe (Copy iframe). Paste it into… |  |  |
| E6 | NOT RUN | E. Marketing website installation | Submit the framed form with you+tqa-form@… and tick only the email box. |  |  |
| E7 | NOT RUN | E. Marketing website installation | Read and confirm these instructions are what you would send: 1. In Alloy: Organization › Locations › Firefl… |  |  |
| F1 | NOT RUN | F. Public inquiry and lead approval | In the framed calendar (E3) fill the form with you+tqa1@…, tick nothing under Hear from QA School, and submit. |  |  |
| F2 | NOT RUN | F. Public inquiry and lead approval | Sidebar Processing → Work. Open the newest case for you+tqa1@…. |  |  |
| F3 | NOT RUN | F. Public inquiry and lead approval | Click Approve — Create enrollment lead. |  |  |
| F4 | NOT RUN | F. Public inquiry and lead approval | Submit a new request for a time, then before approving make that time unavailable (deactivate the schedule … |  |  |
| F5 | NOT RUN | F. Public inquiry and lead approval | Approve the same case again (reload and click Approve if offered). |  |  |
| G1 | NOT RUN | G. Communications consent and opt-out | Form-first form: submit with no box ticked; Approve. |  |  |
| G2 | NOT RUN | G. Communications consent and opt-out | Submit with email ticked only; Approve. |  |  |
| G3 | NOT RUN | G. Communications consent and opt-out | Submit with SMS ticked only; Approve. |  |  |
| G4 | NOT RUN | G. Communications consent and opt-out | Submit with both ticked; Approve. |  |  |
| G5 | NOT RUN | G. Communications consent and opt-out | On the G2 person set email marketing to opted out. Submit a new inquiry with the same email ticking email a… |  |  |
| G6 | NOT RUN | G. Communications consent and opt-out | Same as G5 for SMS on the G3 person. |  |  |
| G7 | NOT RUN | G. Communications consent and opt-out | Look at the G5 / G6 cases again. |  |  |
| G8 | NOT RUN | G. Communications consent and opt-out | Open any G2–G4 case. |  |  |
| G9 | NOT RUN | G. Communications consent and opt-out | Open the G4 person's Communication preferences history. |  |  |
| G10 | NOT RUN | G. Communications consent and opt-out | For the G1 person (no consent), try a marketing email from the person's record. |  |  |
| G11 | NOT RUN | G. Communications consent and opt-out | Same for a marketing SMS to the G1 person. |  |  |
| G12 | NOT RUN | G. Communications consent and opt-out | On staging (Part H) use the unsubscribe link in a delivered marketing email. On the QA preview there is no … |  |  |
| G13 | NOT RUN | G. Communications consent and opt-out | After G5's opt-out, try another marketing email to that person. |  |  |
| G14 | NOT RUN | G. Communications consent and opt-out | (Engineer-verified API contract) a direct send to a suppressed recipient. |  |  |
| G15 | NOT RUN | G. Communications consent and opt-out | Approve a tour request whose family ticked nothing. |  |  |
| G16 | NOT RUN | G. Communications consent and opt-out | Note only: legacy workflow SMS (create_message) cannot bypass suppression. |  |  |
| G17 | NOT RUN | G. Communications consent and opt-out | Note only: scheduled messages are re-checked at dispatch. |  |  |
| H1 | NOT RUN | H. Actual provider delivery (staging, your own address and phone only) | On staging, publish a test location's tour calendar (Part E on staging), book a time with you+tqa-h@… and y… |  |  |
| H2 | NOT RUN | H. Actual provider delivery (staging, your own address and phone only) | Send that person a legitimate marketing email from the record. Open it; click Unsubscribe, then confirm. |  |  |
| H3 | NOT RUN | H. Actual provider delivery (staging, your own address and phone only) | Send a legitimate marketing SMS to your phone. |  |  |
| H4 | NOT RUN | H. Actual provider delivery (staging, your own address and phone only) | Reply STOP to that SMS. |  |  |
| H5 | NOT RUN | H. Actual provider delivery (staging, your own address and phone only) | Try one more marketing email and one more marketing SMS. |  |  |
| H6 | NOT RUN | H. Actual provider delivery (staging, your own address and phone only) | Re-consent only through the authorized preference flow (staff Communication preferences with the family's d… |  |  |
| I1 | NOT RUN | I. Negative paths and cleanup | Open /tours/invalid and /forms/embed/invalid. |  |  |
| I2 | NOT RUN | I. Negative paths and cleanup | Submit the same inquiry twice quickly (double-click submit). |  |  |
| I3 | NOT RUN | I. Negative paths and cleanup | Pick the last free spot of a time in two browser windows; submit both. |  |  |
| I4 | NOT RUN | I. Negative paths and cleanup | While on step 2, have a colleague add a closure over your selected time; submit. |  |  |
| I5 | NOT RUN | I. Negative paths and cleanup | Submit as a family that already exists (same email) and approve. |  |  |
| I6 | NOT RUN | I. Negative paths and cleanup | Open an unsubscribe link with its token altered (staging, H2 email). |  |  |
| I7 | NOT RUN | I. Negative paths and cleanup | Wrong location: open a location's booking page and confirm the times and brand are that location's. |  |  |
| I8 | NOT RUN | I. Negative paths and cleanup | Clean up the QA preview: Withdraw calendar, delete QA Weekdays and its copy, remove the operating-calendar … |  |  |

## Failures and blocked tests

- **D2 FAIL** — At the bottom of a section click + Add question. In the panel, under Answer types → Capture, choose Marketi… — sample note
