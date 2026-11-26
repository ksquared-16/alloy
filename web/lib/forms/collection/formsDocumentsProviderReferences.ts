import type { FormSchemaV1 } from "@/lib/forms/schema";
import type { ProviderConsumerLifecycleStatus, ProviderConsumerReference } from "@/lib/fields/providerConsumerReference";
import { discoverFormsDocumentsSchemaReferences } from "@/lib/forms/collection/formsDocumentsSchemaReferences";

export function providerReferencesFromFormsDocumentsSchema(args: {
    schema: Pick<FormSchemaV1, "fields">;
    artifactId: string;
    artifactVersionId?: string;
    lifecycleStatus: ProviderConsumerLifecycleStatus;
}): ProviderConsumerReference[] {
    return discoverFormsDocumentsSchemaReferences(args.schema).map((ref) => ({
        provider_ref: ref.ref,
        consumer_kind: "forms_documents_schema",
        artifact_id: args.artifactId,
        ...(args.artifactVersionId ? { artifact_version_id: args.artifactVersionId } : {}),
        reference_path: [ref.kind, ref.group_id, ref.field_id].filter(Boolean).join("."),
        lifecycle_status: args.lifecycleStatus,
    }));
}
