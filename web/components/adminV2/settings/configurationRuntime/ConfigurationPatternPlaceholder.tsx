"use client";

export type ConfigurationPatternSurface =
    | "fields"
    | "actions"
    | "user-roles"
    | "communications";

const SURFACE_COPY: Record<
    ConfigurationPatternSurface,
    { testId: string; context: string; queue: string; workspace: string; note?: string }
> = {
    fields: {
        testId: "fields-configuration-pattern-placeholder",
        context: "Fields title + entity selector (Person, Family, Child, Lead, Location, …)",
        queue: "Entities · field groups · fields",
        workspace:
            "Selected field detail — label, type, format, validation, editability, visibility, system binding, conditional behavior, where-used summary",
        note: "System fields: read-only cards, separate from editable custom fields.",
    },
    actions: {
        testId: "actions-configuration-pattern-placeholder",
        context: "Action buttons title + process/scope filters",
        queue: "Action list",
        workspace: "Selected action setup — visibility, placement, requirements",
    },
    "user-roles": {
        testId: "user-roles-configuration-pattern-placeholder",
        context: "Users & Roles title + org scope",
        queue: "Roles · permission groups",
        workspace: "Selected role permission setup",
    },
    communications: {
        testId: "communications-configuration-pattern-placeholder",
        context: "Communications setup title + channel scope",
        queue: "Channels · templates · messaging rules",
        workspace: "Selected template, channel, or rule setup",
    },
};

/**
 * Compact rollout placeholder — documents Context → Queue → Workspace target without replacing legacy hub UI.
 */
export default function ConfigurationPatternPlaceholder({ surface }: { surface: ConfigurationPatternSurface }) {
    const copy = SURFACE_COPY[surface];
    return (
        <section
            className="rounded-xl border border-alloy-forge/14 bg-white px-4 py-3"
            data-testid={copy.testId}
        >
            <p className="config-typo-field-label">Configuration pattern · next</p>
            <p className="config-typo-sublabel mt-1">Context → Queue → Workspace → BOS</p>
            <ul className="mt-2 space-y-1">
                <li className="config-typo-sublabel">
                    <span className="font-medium text-alloy-midnight/85">Context:</span> {copy.context}
                </li>
                <li className="config-typo-sublabel">
                    <span className="font-medium text-alloy-midnight/85">Queue:</span> {copy.queue}
                </li>
                <li className="config-typo-sublabel">
                    <span className="font-medium text-alloy-midnight/85">Workspace:</span> {copy.workspace}
                </li>
                {copy.note ?
                    <li className="config-typo-sublabel">{copy.note}</li>
                :   null}
            </ul>
        </section>
    );
}
