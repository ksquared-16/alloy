/**
 * STAGE COMMANDS — the one list of "main things you'd do at this stage".
 *
 * Two command models, two owners, never one list read two ways:
 *
 *   Process Card  ← `stage_operating_plan_v1.stage_commands` (Stages → Operator work → Stage commands).
 *                   Per stage, ordered, published with the process.
 *   Manage        ← the Commands tab (`action_placements`): every command enabled for the process.
 *
 * Commands used to live on WORK TEMPLATES (`primary_action` + `helpful_actions`), and the card read
 * only the one template that happened to be active — so commands authored on any other work item of
 * the stage never reached it. They are stage-owned now.
 *
 * READ-TIME MIGRATION. A plan saved before stage commands existed carries no `stage_commands`. Its
 * list is derived here from the work templates it does carry — every template's primary command and
 * helpful commands, primary work item first, de-duplicated — so nothing an administrator configured
 * disappears. Saving the stage writes the list explicitly and the derivation stops applying. Nothing
 * stored is rewritten.
 */

import type {
    StageOperatingPlanV1,
    StageWorkTemplateActionRefV1,
    StageWorkTemplateV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { normalizeActionRefToIntentKey } from "@/lib/lifecycle/workTemplateActionIntentCatalog";

export type StageCommandsSource = "stage" | "derived_from_work_items";

export type ResolvedStageCommands = {
    commands: StageWorkTemplateActionRefV1[];
    /** `stage` = authored on the stage; `derived_from_work_items` = legacy plan, migrated on read. */
    source: StageCommandsSource;
};

function cleanRef(row: StageWorkTemplateActionRefV1 | null | undefined): StageWorkTemplateActionRefV1 | null {
    const action_ref = row?.action_ref?.trim();
    if (!action_ref) return null;
    const override_label = row?.override_label?.trim();
    const work_template_key = row?.work_template_key?.trim();
    return {
        action_ref,
        ...(override_label ? { override_label } : {}),
        ...(work_template_key ? { work_template_key } : {}),
    };
}

/** Identity for de-duplication — the intent, so `schedule_tour` and its alias are one command. */
export function stageCommandIdentity(ref: Pick<StageWorkTemplateActionRefV1, "action_ref">): string {
    return normalizeActionRefToIntentKey(ref.action_ref.trim());
}

function dedupe(rows: Array<StageWorkTemplateActionRefV1 | null | undefined>): StageWorkTemplateActionRefV1[] {
    const seen = new Set<string>();
    const out: StageWorkTemplateActionRefV1[] = [];
    for (const raw of rows) {
        const row = cleanRef(raw);
        if (!row) continue;
        const identity = stageCommandIdentity(row);
        if (seen.has(identity)) continue;
        seen.add(identity);
        out.push(row);
    }
    return out;
}

/** Primary work item first (the one the stage leads with), then the rest in authored order. */
function templatesInStageOrder(templates: readonly StageWorkTemplateV1[]): StageWorkTemplateV1[] {
    const primary = templates.find((t) => t.primary === true) ?? null;
    return primary ? [primary, ...templates.filter((t) => t !== primary)] : [...templates];
}

/** The legacy derivation: every work item's primary + helpful commands, in stage order. */
export function deriveStageCommandsFromWorkTemplates(
    templates: readonly StageWorkTemplateV1[] | null | undefined,
): StageWorkTemplateActionRefV1[] {
    const rows: Array<StageWorkTemplateActionRefV1 | undefined> = [];
    for (const template of templatesInStageOrder(templates ?? [])) {
        rows.push(template.primary_action);
        rows.push(...(template.helpful_actions ?? []));
    }
    return dedupe(rows);
}

/**
 * The stage's commands, in force — authored on the stage, or migrated on read from its work items.
 *
 * `legacyCatalogCommands` are the stage action catalog's supporting commands NOT bound to a work
 * item (start-work controls are bound, and stay separately authored). Before stage commands they
 * composed onto the card beside the work items' commands, so a legacy plan's derived list carries
 * them too — otherwise the editor would show a list the card does not, and the first save would
 * silently drop them. An authored list ignores them: it is the whole list.
 */
export function resolveStageCommands(
    plan: Pick<StageOperatingPlanV1, "stage_commands" | "work_templates"> | null | undefined,
    options?: { legacyCatalogCommands?: readonly StageWorkTemplateActionRefV1[] },
): ResolvedStageCommands {
    if (!plan) return { commands: [], source: "stage" };
    if (plan.stage_commands !== undefined) {
        return { commands: dedupe(plan.stage_commands), source: "stage" };
    }
    return {
        commands: dedupe([
            ...deriveStageCommandsFromWorkTemplates(plan.work_templates),
            ...(options?.legacyCatalogCommands ?? []),
        ]),
        source: "derived_from_work_items",
    };
}
