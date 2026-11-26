# Surface Builder V2 — Interaction Walkthrough

The builder should answer five questions *before* they're asked: **What am I editing? Where does it appear? How do I add content? How do I configure it? How do I publish?** This walkthrough traces a first-time operator from open to live with no confusing moment.

Mockups referenced: [`01-builder`](mockups/01-builder.html) · [`02-add-card`](mockups/02-add-card.html) · [`03-publish-and-modes`](mockups/03-publish-and-modes.html) · [`04-inspector-and-states`](mockups/04-inspector-and-states.html).

---

## 0 · Open the builder
**Settings → Surfaces → Operational Intelligence → Open builder.**

The top bar states it plainly: breadcrumb `Settings › Surfaces › Operational Intelligence`, the surface title, and **“Appears in · Workspace → Analytics modal.”** A mode segment (**Editing · Preview · Runtime**) sits on the right with **Editing** lit, next to a **Draft** pill and **Publish**.

> Answers *what am I editing* and *where does it appear* in the first second — before the canvas is even read.

## 1 · Read the canvas (it's the preview)
The center is not a config form — it's the **live surface**. Real KPI, trend, gauge, and health cards render exactly as the runtime draws them. A green banner reads **“Live preview — edits render here instantly.”**

> Answers *where is the preview*: there is no separate preview. The canvas is it.

## 2 · Understand the sections (left tree)
The left panel owns **Sections** — Overview, Health, Trends, Comparisons, Forecasts, Reports — each with its card count and an **Add card** affordance. Cards live *inside* sections. The active section (Overview) is highlighted and matches the canvas.

> Answers *how do I add another one*: you don't hunt for a card — you add into a section.

## 3 · Add a card (inline, three beats)
Click **Add card** under Overview. A popover opens *in place* (Notion-style), never a new page:

1. **Choose card type** — KPI, Trend, Gauge, Chart, Table, Comparison, Health, Narrative, Action panel. Each with a one-line plain-language description.
2. **Choose content** — a searchable list of **questions**, grouped by business process (“What share of scheduled tours completed?”), each tagged **Live**. No “metric definitions.”
3. **Configure** — a **live mini-card** previews every change; set title, renderer, thresholds. **Add to Overview.**

The new card lands in Overview on the canvas, **already selected**, inspector open.

> Answers *how do I add content* — one inline flow, always previewed.

## 4 · Configure (inspector edits, canvas reacts)
The inspector binds to the selected card with five plain-language groups:

- **Card** — title, description, visibility
- **Content** — metric/calculation, the question it answers
- **Renderer** — KPI / Trend / Gauge / Chart / Table / Comparison / Health
- **Behavior** — thresholds, comparison, drill, refresh
- **Placement** — where it appears (Operational Intelligence, Workspace Header, Work Unit Header, Executive Performance, Reports)

Change the **renderer** → the canvas card switches instantly. Change a **threshold** → the tone re-colors instantly. Change the **question** → the card's eyebrow updates instantly. No save, no reload, no disconnect.

> Answers *how do I configure content*. **Placement** (renamed from “Promote”) is where you decide where a card surfaces — implementation still writes `metric_placements`, but the operator only ever sees “where it appears.”

## 5 · Preview (optional dry run)
Flip the mode to **Preview**. The same canvas drops all edit chrome — drag handles, tools, selection — and shows precisely what operators will see, still using your unpublished draft. Flip back to **Editing** to keep working.

> Answers *what am I editing vs what will they see* — same pixels, chrome removed.

## 6 · Publish (with confidence)
Click **Publish**. The pill walks four legible beats:

1. **Draft · N edits** — you always know there's something to publish.
2. **Saving…** — instant acknowledgement; the button disables (no double-publish).
3. **Published ✓** — green confirmation; the button goes quiet.
4. **Runtime updated** — confirmation the live surface now reflects the change.

A toast lands: **“Published — runtime updated. Open Runtime →.”**

> Answers *did Publish work* and *why didn't runtime change* — the state says so, and the toast hands you the way to verify.

## 7 · View runtime
Click **Open Runtime** (or flip the mode to **Runtime**). The canvas shows the **published, live** surface — read-only, the source of truth — identical to Workspace → Analytics.

> Closes the loop: edit → preview → publish → see it live, without leaving the builder.

---

## The five questions, answered before they're asked
| Question | Answered by |
|---|---|
| Where is the preview? | The canvas **is** the preview (step 1). |
| How do I add another card? | Per-section **Add card** → inline flow (steps 2–3). |
| Did Publish work? | Draft → Saving → Published → Runtime updated (step 6). |
| What did Publish do? | “Runtime updated” + **Open Runtime** toast (steps 6–7). |
| What am I editing? | Top bar context + mode segment + “Appears in” (step 0). |
