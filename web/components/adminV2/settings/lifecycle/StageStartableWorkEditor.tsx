"use client";

/**
 * WHICH OF THIS STAGE'S WORK AN OPERATOR MAY START.
 *
 * A stage's operating plan can declare several work templates, and entry opens the PRIMARY one and
 * nothing else — deliberately, because offering a place is a decision somebody makes, not something
 * that happens to a child because a date passed. The platform already has the generic action for
 * the other half (`stage_work.start`, which takes the template as an INPUT so it needs no key of its
 * own), and it already refuses correctly.
 *
 * What did not exist was any way to SAY IT. The action requires a `template_key`; no configuration
 * vocabulary could carry one; so a fully built capability was unreachable, and on this tenant
 * `offer_spot` sat configured — its own outcomes, its own rules, its own transition to Enrolling —
 * with nothing anywhere that could start it. The offer flow read as working right up until someone
 * looked for the control.
 *
 * ── WHY THIS IS NOT AN "OFFER SPOT" TOGGLE ──
 *
 * The rows are the stage's own work templates, whatever they are. The action key is the platform's
 * own constant for "start stage work" — platform code naming a platform capability, never a tenant's
 * key. Point this at a stage with three startable templates and it offers three; point it at a stage
 * with none and it says so.
 *
 * The stage's PRIMARY work is excluded because entry already opens it. Offering a control to start
 * work that is always already open would be a button that can only ever report "already running".
 */

import { useCallback, useMemo, useState } from "react";
import { Play } from "lucide-react";

import type { StageCandidateAction } from "@/lib/lifecycle/stageActionCatalogV1";
import type { StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** The platform's generic "begin a piece of work this stage configures" action. */
const STAGE_WORK_START_ACTION_KEY = "stage_work.start";

export default function StageStartableWorkEditor({
    workTemplates,
    candidateActions,
    onChange,
    disabled,
}: {
    workTemplates: readonly StageWorkTemplateV1[];
    candidateActions: readonly StageCandidateAction[];
    onChange: (next: StageCandidateAction[]) => void;
    disabled?: boolean;
}) {
    const [notice, setNotice] = useState<string | null>(null);

    /** Entry already opens the primary work, so only the rest can meaningfully be started. */
    const startable = useMemo(
        () => workTemplates.filter((t) => t.primary !== true),
        [workTemplates],
    );

    const enabledKeys = useMemo(
        () =>
            new Set(
                candidateActions
                    .filter((a) => a.action_key === STAGE_WORK_START_ACTION_KEY && a.work_template_key)
                    .map((a) => a.work_template_key!),
            ),
        [candidateActions],
    );

    const toggle = useCallback(
        (templateKey: string) => {
            const isOn = enabledKeys.has(templateKey);
            /*
             * A start action naming NO work can never start anything — the action requires the
             * template as an input and refuses without it. Such rows existed on the staging tenant
             * because an earlier persistence step dropped the key, and every save appended another.
             * They are dropped on any edit here rather than preserved as "operator-authored
             * behaviour": nothing authored them, and nothing can execute them.
             */
            const usable = candidateActions.filter(
                (a) => a.action_key !== STAGE_WORK_START_ACTION_KEY || Boolean(a.work_template_key?.trim()),
            );
            const next = isOn
                ? usable.filter(
                      (a) =>
                          !(a.action_key === STAGE_WORK_START_ACTION_KEY && a.work_template_key === templateKey),
                  )
                : [
                      ...usable,
                      {
                          action_key: STAGE_WORK_START_ACTION_KEY,
                          recommendation: "ready" as const,
                          work_template_key: templateKey,
                      },
                  ];
            onChange(next);
            setNotice(
                isOn
                    ? "Removed. Save the stage, then publish, to take it out of the runtime."
                    : "Added. Save the stage, then publish, to make it available to operators.",
            );
        },
        [candidateActions, enabledKeys, onChange],
    );

    return (
        <div data-testid="stage-startable-work" className="mt-4 border-t border-alloy-midnight/8 pt-4">
            <div className="mb-2 flex items-center gap-1.5">
                <Play size={13} className="text-alloy-midnight/45" />
                <h4 className="text-[0.8125rem] font-semibold text-alloy-midnight">Work an operator may start</h4>
            </div>
            <p className="stage-field__hint mb-3">
                Entry opens this stage&rsquo;s main work automatically. Anything else happens because
                someone decides to begin it — tick it here to give operators the control.
            </p>

            {startable.length === 0 ? (
                <p className="mb-2 rounded-lg bg-alloy-midnight/[0.03] px-3 py-2 text-[0.75rem] text-alloy-midnight/55">
                    {workTemplates.length === 0
                        ? "This stage has no work configured yet."
                        : "This stage has only its main work, which entry already opens."}
                </p>
            ) : (
                <ul className="space-y-2">
                    {startable.map((template) => (
                        <li
                            key={template.template_key}
                            className="rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2"
                        >
                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={enabledKeys.has(template.template_key)}
                                    onChange={() => toggle(template.template_key)}
                                    disabled={disabled}
                                    aria-label={`Let operators start ${template.label ?? template.template_key}`}
                                    data-testid={`stage-startable-work-${template.template_key}`}
                                />
                                <span className="flex-1 truncate text-[0.8125rem] text-alloy-midnight">
                                    {template.label ?? template.template_key}
                                </span>
                            </label>
                        </li>
                    ))}
                </ul>
            )}

            {notice ? (
                <p className="mt-2 text-[0.75rem] text-alloy-pine" data-testid="stage-startable-work-notice">
                    {notice}
                </p>
            ) : null}
        </div>
    );
}
