/**
 * Maps field_definitions.field_type → field_values typed columns.
 * Clears sibling columns on write so one source column is authoritative.
 */
export type FieldValueRow = {
  value?: string | null;
  value_text?: string | null;
  value_number?: number | null;
  value_boolean?: boolean | null;
  value_date?: string | null;
  value_json?: unknown | null;
};

const EMPTY_TYPED: Record<string, unknown> = {
  value: null,
  value_text: null,
  value_number: null,
  value_boolean: null,
  value_date: null,
  value_json: null,
};

/** Build insert/update payload from a string form value (API or form). */
export function payloadFromFieldType(fieldType: string, raw: unknown): Record<string, unknown> {
  const s =
    raw == null
      ? ""
      : typeof raw === "boolean"
        ? raw
          ? "true"
          : "false"
        : typeof raw === "number" && !Number.isNaN(raw)
          ? String(raw)
          : String(raw).trim();

  const t = (fieldType || "text").toLowerCase();
  if (s === "") {
    return { ...EMPTY_TYPED };
  }

  if (t === "number") {
    const n = parseFloat(s.replace(/,/g, ""));
    const num = Number.isFinite(n) ? n : null;
    return { ...EMPTY_TYPED, value_number: num, value_text: s };
  }

  if (t === "boolean") {
    const b = s === "true" || s === "1" || s.toLowerCase() === "yes";
    return { ...EMPTY_TYPED, value_boolean: b, value_text: s };
  }

  if (t === "date" || t === "datetime") {
    const ms = Date.parse(s);
    const iso = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
    return { ...EMPTY_TYPED, value_date: iso, value_text: s };
  }

  return { ...EMPTY_TYPED, value_text: s };
}

/** Display string for drawer/forms from a field_values row. */
export function displayFromFieldValueRow(
  fieldType: string,
  row: FieldValueRow | null | undefined
): string {
  if (!row) return "";
  const t = (fieldType || "text").toLowerCase();
  if (t === "number" && row.value_number != null && !Number.isNaN(Number(row.value_number))) {
    return String(row.value_number);
  }
  if (t === "boolean" && row.value_boolean != null) {
    return row.value_boolean ? "true" : "false";
  }
  if ((t === "date" || t === "datetime") && row.value_date) {
    return String(row.value_date).slice(0, t === "date" ? 10 : 16);
  }
  if (row.value_text != null && row.value_text !== "") return row.value_text;
  if (row.value != null && row.value !== "") return row.value;
  if (row.value_json != null) {
    try {
      return typeof row.value_json === "string" ? row.value_json : JSON.stringify(row.value_json);
    } catch {
      return "";
    }
  }
  return "";
}
