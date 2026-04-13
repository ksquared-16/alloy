/**
 * Deterministic command parser for Agent Config Lab assistant (no LLM).
 * Grammar is intentionally small and regex-based.
 */

export type AssistantParsedFieldTable = {
    kind: "field_table";
    action: "hide" | "show";
    /** Text between "field" and "from table" */
    labelQuery: string;
};

export type AssistantParsedFieldDrawer = {
    kind: "field_drawer";
    action: "hide" | "show";
    labelQuery: string;
};

export type AssistantParsedOverviewFinancial = {
    kind: "overview_financial";
    action: "hide" | "show";
};

export type AssistantParsed =
    | AssistantParsedFieldTable
    | AssistantParsedFieldDrawer
    | AssistantParsedOverviewFinancial;

export type AssistantParseResult =
    | { ok: true; parsed: AssistantParsed }
    | { ok: false; error: string };

const RE_FIELD_TABLE = /^(hide|show)\s+field\s+(.+?)\s+from\s+table\s*$/i;
const RE_FIELD_DRAWER = /^(hide|show)\s+field\s+(.+?)\s+in\s+drawer\s*$/i;
const RE_OVERVIEW_FIN = /^(hide|show)\s+financial\s+band\s+on\s+job\s+overview\s*$/i;

export function parseAssistantCommand(raw: string): AssistantParseResult {
    const s = raw.trim();
    if (!s) {
        return { ok: false, error: "Enter a command." };
    }

    let m = RE_OVERVIEW_FIN.exec(s);
    if (m) {
        const action = m[1].toLowerCase() === "hide" ? "hide" : "show";
        return { ok: true, parsed: { kind: "overview_financial", action } };
    }

    m = RE_FIELD_TABLE.exec(s);
    if (m) {
        const action = m[1].toLowerCase() === "hide" ? "hide" : "show";
        const labelQuery = m[2].trim().replace(/^["']|["']$/g, "");
        if (!labelQuery) {
            return { ok: false, error: "Missing field name or label after “field”." };
        }
        return { ok: true, parsed: { kind: "field_table", action, labelQuery } };
    }

    m = RE_FIELD_DRAWER.exec(s);
    if (m) {
        const action = m[1].toLowerCase() === "hide" ? "hide" : "show";
        const labelQuery = m[2].trim().replace(/^["']|["']$/g, "");
        if (!labelQuery) {
            return { ok: false, error: "Missing field name or label after “field”." };
        }
        return { ok: true, parsed: { kind: "field_drawer", action, labelQuery } };
    }

    return {
        ok: false,
        error:
            'Unknown command. Try: hide field <label> from table — show field <label> in drawer — hide financial band on job overview',
    };
}
