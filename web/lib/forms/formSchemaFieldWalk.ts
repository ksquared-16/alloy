import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";

export function walkScalarFormFields(schema: FormSchemaV1, visit: (f: FormField) => void): void {
    const walk = (fields: FormField[]) => {
        for (const f of fields) {
            if (f.type === "group") walk(f.fields);
            else visit(f);
        }
    };
    walk(schema.fields);
}

export function collectScalarFormFieldIds(schema: FormSchemaV1): Set<string> {
    const ids = new Set<string>();
    walkScalarFormFields(schema, (f) => ids.add(f.id));
    return ids;
}

export function collectReadOnlyScalarFieldIds(schema: FormSchemaV1): Set<string> {
    const ids = new Set<string>();
    walkScalarFormFields(schema, (f) => {
        if (f.read_only === true) ids.add(f.id);
    });
    return ids;
}
