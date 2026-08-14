/**
 * SUBJECT GRAIN — the one place the lens's Row Grain becomes the panel's subject grain.
 *
 * Alloy carries the grain idea in two vocabularies that do not line up, and this is the seam between them:
 *
 *   StageGrain / RowGrain  "family" | "child" | "person" | "account" | "work_item"   (lifecycle / stages)
 *   OperationalGrain       "case"   | "child" | "candidate"                          (Focus Panel)
 *
 * Note `family` ≢ `case` by NAME while meaning the same thing, and that `candidate` exists only on the panel
 * side while `person`/`account`/`work_item` exist only on the stage side. A silent `?? "case"` across that
 * seam is exactly how a surface ends up answering a question it was not asked — the defect class Subject
 * Authority eliminated. So this function is TOTAL and its failure is a value, never a fallback.
 *
 * DERIVE ONCE. The provisioning answer resolves the lens grain, calls this, and publishes the result on the
 * answer. Downstream layers READ that field; none of them re-derives grain, and none of them may hardcode it.
 * (Before this existed, `buildCommitCriticalOperationalContext` hardcoded `grain: "case"` and
 * `subject.type: "opportunity"` while the answer was already carrying `rowGrain` a few lines away.)
 */

import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";
import type { OperationalGrain } from "@/lib/adminV2/runtime/operationalContext/types";

/**
 * The subject entity type that goes on `OperationalSubjectRef.type`.
 *
 * Deliberately NOT the command vocabulary. The capability registry describes a child's enrollment-state
 * commands with `opportunity_customer_member` and its assignment/relationship commands with `child`, and
 * `PlatformActionGrain` is a closed union containing neither `child` nor `person` — a real contradiction
 * documented in `docs/runtime/GRAIN-AUTHORITY-MAP.md` §10. Resolving it is a separate decision; this type is
 * only what the panel calls its subject, and existing guards that compare against `"opportunity"` keep
 * working unchanged for the family grain.
 */
export type OperationalSubjectType = "opportunity" | "child" | "person";

export type SubjectGrainResolution =
    | { ok: true; grain: OperationalGrain; subjectType: OperationalSubjectType }
    | { ok: false; reason: string };

/**
 * Resolve a LENS's Row Grain into the panel's subject grain.
 *
 * `family` → `case` is the rename this seam exists to absorb. `child` passes through. Everything else has no
 * Focus Panel representation TODAY, and says so — a `person`/`account`/`work_item` lens is a configuration
 * the panel cannot present, not a lens to render as a family.
 *
 * ── WHY `person` STILL REFUSES HERE, NOW THAT A PERSON SUBJECT EXISTS ──
 *
 * `OperationalSubjectType` gained `"person"` for DURABLE record attention, which arrives subject-first and
 * never through a lens (`focusPanelWorkModeModelFromDurableSubject`). This function answers a different
 * question: *"a queue lens declared Row Grain `person` — what should its rows compose?"* There is still no
 * person-grain queue: no provider produces person rows, so a lens declaring it would page nothing. Answering
 * `{ ok: true }` here would turn "this lens can never have rows" into an empty panel that looks configured.
 *
 * The refusal is therefore about the LENS, not about the subject. Widening it belongs to whatever slice
 * actually builds a person-grain queue provider — a different, larger question than durable records.
 */
export function resolveSubjectGrain(rowGrain: StageGrain): SubjectGrainResolution {
    switch (rowGrain) {
        case "family":
            return { ok: true, grain: "case", subjectType: "opportunity" };
        case "child":
            return { ok: true, grain: "child", subjectType: "child" };
        case "person":
        case "account":
        case "work_item":
            return {
                ok: false,
                reason: `Row Grain "${rowGrain}" has no Focus Panel subject — this surface cannot present it`,
            };
    }
}
