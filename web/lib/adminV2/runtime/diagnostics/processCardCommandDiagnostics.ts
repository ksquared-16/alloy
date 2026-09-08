/**
 * PROCESS CARD COMMAND DRIFT — an observable configuration fault, not an operator message.
 *
 * A Business Process can configure a command whose action is no longer registered. The resolvers
 * cannot render what they cannot resolve, so such a command simply disappears — and a card with one
 * fewer button is indistinguishable from a process that configured one fewer command. That silence
 * is the failure: it hides a broken configuration behind a plausible-looking card.
 *
 * So drift is reported here instead. It is deliberately NOT rendered: an operator must never read a
 * platform limitation as a command, and substituting a different action would be worse still. What
 * an operator sees stays exactly what the configuration selected AND the platform resolved; what an
 * engineer or admin sees additionally includes what the configuration selected and the platform
 * could not.
 *
 * Never a control path — nothing here changes what renders.
 */

export type ProcessCardCommandDriftEvent = {
    processKey: string | null;
    stageKey: string | null;
    actionRef: string;
    slot: "primary_action" | "helpful_action";
    code: "configured_command_not_registered";
    message: string;
};

export type ProcessCardCommandWithheldEvent = {
    processKey: string | null;
    stageKey: string | null;
    key: string;
    label: string;
};

type DriftWindow = Window & {
    /** Read by browser certification and by the config-validation surface. */
    __ALLOY_PROCESS_COMMAND_DRIFT?: ProcessCardCommandDriftEvent[];
    /** Executable commands the configuration never selected, so the row does not carry them. */
    __ALLOY_PROCESS_COMMAND_WITHHELD?: ProcessCardCommandWithheldEvent[];
    __ALLOY_PROCESS_COMMAND_PROJECTION?: ProcessCardCommandProjectionEvent[];
};

/** Report one configured command that did not resolve to a registered action. */
export function logProcessCardCommandDrift(event: ProcessCardCommandDriftEvent): void {
    if (typeof window === "undefined") return;
    const w = window as DriftWindow;
    const seen = (w.__ALLOY_PROCESS_COMMAND_DRIFT ??= []);
    // Same fault, same stage, same ref — report it once per page rather than once per render.
    const duplicate = seen.some(
        (row) =>
            row.actionRef === event.actionRef
            && row.stageKey === event.stageKey
            && row.processKey === event.processKey,
    );
    if (duplicate) return;
    seen.push(event);
    // eslint-disable-next-line no-console -- configuration fault, engineer-facing by design
    console.warn(
        `[process-command-drift] ${event.message}`,
        { processKey: event.processKey, stageKey: event.stageKey, slot: event.slot },
    );
}

/**
 * Report one executable command the configuration did not select.
 *
 * Not a fault — a runtime companion (a state rule's addition) is legitimate elsewhere. It is
 * recorded so "the row is exactly what configuration selected" stays a checkable claim rather than
 * an assertion, which is what the certification pass reads.
 */
export function logProcessCardCommandWithheld(event: ProcessCardCommandWithheldEvent): void {
    if (typeof window === "undefined") return;
    const w = window as DriftWindow;
    const seen = (w.__ALLOY_PROCESS_COMMAND_WITHHELD ??= []);
    if (seen.some((row) => row.key === event.key && row.stageKey === event.stageKey)) return;
    seen.push(event);
}

/** Test seam: drop what has been reported on this page. */
export function resetProcessCardCommandDrift(): void {
    if (typeof window === "undefined") return;
    (window as DriftWindow).__ALLOY_PROCESS_COMMAND_DRIFT = [];
    (window as DriftWindow).__ALLOY_PROCESS_COMMAND_WITHHELD = [];
}

/**
 * One projection, as configuration handed it over and as the card ended up with it.
 *
 * Drift and withheld each answer half the question. This answers the whole one — "which refs did
 * configuration name for this stage, and which commands came out" — which is what makes a
 * configuration-parity claim checkable in a browser instead of inferred from the rendered row.
 * Engineer-facing, never rendered, and carries no operator vocabulary.
 */
export type ProcessCardCommandProjectionEvent = {
    processKey: string | null;
    stageKey: string | null;
    configuredRefs: string[];
    commandKeys: string[];
    /** The published operating plan's templates as the runtime received them. */
    planTemplates?: Array<{ label: string; helpful: string[] }>;
    /** The process's own command selection, when the published inputs carry one. */
    commandProjection?: unknown;
};

export function logProcessCardCommandProjection(event: ProcessCardCommandProjectionEvent): void {
    if (typeof window === "undefined") return;
    const w = window as DriftWindow;
    const seen = (w.__ALLOY_PROCESS_COMMAND_PROJECTION ??= []);
    const signature = (row: ProcessCardCommandProjectionEvent) =>
        `${row.processKey}|${row.stageKey}|${row.configuredRefs.join(",")}|${row.commandKeys.join(",")}`;
    const next = signature(event);
    // The same stage projecting the same row every render is one fact, not many.
    if (seen.some((row) => signature(row) === next)) return;
    seen.push(event);
}
