/**
 * WHAT A DOCUMENT-ORIGINATED FORM IS, RIGHT NOW.
 *
 * One answer for every reader — the Studio that edits it and the create step that turns it into a real
 * form — so the form an operator generates is exactly the form they were looking at:
 *   - once Forms Studio has saved it, its own schema (`studio_schema`), as authored;
 *   - before that, the importer's initial form, derived from the draft.
 *
 * A stored schema that no longer validates is not silently replaced by the importer's view — that would
 * discard the operator's work without saying so. It is reported, and the caller refuses.
 */
import { safeParseFormSchema, type FormSchemaV1 } from "@/lib/forms/schema";
import { draftFormToFormSchemaV1 } from "./draftFormToFormSchemaV1";
import type { StoredFormDraftPreview } from "./types";

export type StudioSchemaResolution =
    | { readonly ok: true; readonly schema: FormSchemaV1; readonly source: "studio" | "import" }
    | { readonly ok: false; readonly source: "studio" | "import" };

export function studioSchemaForDraft(draft: StoredFormDraftPreview): StudioSchemaResolution {
    if (draft.studio_schema) {
        const parsed = safeParseFormSchema(draft.studio_schema);
        return parsed.success ? { ok: true, schema: parsed.data, source: "studio" } : { ok: false, source: "studio" };
    }
    const parsed = safeParseFormSchema(draftFormToFormSchemaV1(draft));
    return parsed.success ? { ok: true, schema: parsed.data, source: "import" } : { ok: false, source: "import" };
}
