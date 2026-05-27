"use client";

import { DocumentCompositionEditor } from "@/components/admin/forms/documentComposition/DocumentCompositionEditor";
import type { FormSchemaV1 } from "@/lib/forms/schema";

export type StructuredFormSchemaEditorProps = {
    schema: FormSchemaV1;
    onChange: (next: FormSchemaV1) => void;
    disabled?: boolean;
};

/** Delegates to document composition editor (FD-8). */
export default function StructuredFormSchemaEditor(props: StructuredFormSchemaEditorProps) {
    return <DocumentCompositionEditor {...props} />;
}

export { StructuredFormSchemaEditor };
