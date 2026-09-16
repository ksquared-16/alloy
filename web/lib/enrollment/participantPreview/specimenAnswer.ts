/**
 * A plausible answer for whatever the conversation just asked — for QA acceleration only.
 *
 * Derived from the turn the RUNTIME produced: its editor kind, its input type, its options. Nothing
 * here knows anything about Admissions specifically, which is the point — a specimen that had to be
 * maintained alongside a particular Form would rot the first time the Form changed.
 *
 * Returns null when it cannot produce something it believes is valid. The caller stops there rather
 * than sending a guess: a specimen the runtime refuses is a correct refusal, and forcing past it
 * would be the moment this stopped being a QA aid and became a lie about the conversation.
 */
export function specimenAnswerForTurn(turn: Record<string, unknown>): string | null {
    const options = Array.isArray(turn.options) ? (turn.options as unknown[]) : [];
    if (options.length) {
        const first = options[0] as { value?: unknown; label?: unknown } | string;
        if (typeof first === "string") return first;
        const v = first?.value ?? first?.label;
        return typeof v === "string" ? v : null;
    }

    const editor = (turn.editor ?? {}) as { inputType?: unknown; kind?: unknown };
    const inputType = String(editor.inputType ?? turn.input_type ?? "text").toLowerCase();
    const label = String(turn.label ?? "").toLowerCase();
    const key = String(turn.canonical_key ?? "").toLowerCase();

    if (inputType === "date") return "2021-04-12";
    if (inputType === "email" || label.includes("email") || key.includes("email")) return "qa.preview@example.test";
    if (inputType === "tel" || label.includes("phone") || key.includes("phone")) return "5555550123";
    if (inputType === "number") return "3";
    if (label.includes("zip") || label.includes("postal")) return "97701";
    if (label.includes("address")) return "123 Preview Street, Bend, OR 97701";
    if (label.includes("name")) return "Rowan Preview";
    if (inputType === "checkbox" || inputType === "boolean") return "yes";
    if (inputType === "text" || inputType === "textarea") return "Preview specimen";
    return null;
}
