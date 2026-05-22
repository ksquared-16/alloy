import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import type { PacketReviewTechnicalDetails } from "@/components/forms/packets/PacketReviewRollupView";
import { FormsTechnicalDetailStack } from "@/components/forms/review/FormsTechnicalDetailStack";
import { TechnicalDetailDisclosure, TechnicalDetailJsonBlock } from "@/components/forms/review/TechnicalDetailDisclosure";
import {
    TechnicalDetailField,
    TechnicalDetailFieldList,
    TechnicalDetailMonospaceValue,
} from "@/components/forms/review/TechnicalDetailFieldList";
import { FORMS_TECHNICAL_DISCLOSURE } from "@/lib/forms/review/formsReviewTechnicalDisclosure";

type Props = {
    rollup: PacketReviewRollupV1;
    technicalDetails: PacketReviewTechnicalDetails;
};

export function PacketReviewTechnicalPanel({ rollup, technicalDetails }: Props) {
    return (
        <FormsTechnicalDetailStack>
            <TechnicalDetailDisclosure
                title={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.title}
                helperText={FORMS_TECHNICAL_DISCLOSURE.technicalDetails.helper}
            >
                {technicalDetails.identifiers ?
                    <TechnicalDetailFieldList>
                        {technicalDetails.identifiers.packet_session_id ?
                            <TechnicalDetailField label="Packet session id" fullWidth>
                                <TechnicalDetailMonospaceValue>
                                    {technicalDetails.identifiers.packet_session_id}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                        : null}
                        {technicalDetails.identifiers.packet_definition_key ?
                            <TechnicalDetailField label="Packet definition key">
                                <TechnicalDetailMonospaceValue>
                                    {technicalDetails.identifiers.packet_definition_key}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                        : null}
                        {technicalDetails.identifiers.opportunity_id ?
                            <TechnicalDetailField label="Opportunity id" fullWidth>
                                <TechnicalDetailMonospaceValue>
                                    {technicalDetails.identifiers.opportunity_id}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                        : null}
                        {technicalDetails.identifiers.customer_id ?
                            <TechnicalDetailField label="Customer id" fullWidth>
                                <TechnicalDetailMonospaceValue>
                                    {technicalDetails.identifiers.customer_id}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                        : null}
                        {technicalDetails.identifiers.recipient_person_id ?
                            <TechnicalDetailField label="Recipient person id" fullWidth>
                                <TechnicalDetailMonospaceValue>
                                    {technicalDetails.identifiers.recipient_person_id}
                                </TechnicalDetailMonospaceValue>
                            </TechnicalDetailField>
                        : null}
                    </TechnicalDetailFieldList>
                : null}
                {rollup.steps.some((s) => s.item_status) ?
                    <div className="mt-3">
                        <TechnicalDetailJsonBlock
                            title="Step item status"
                            subtitle="Per-step execution state from packet session items."
                            value={Object.fromEntries(
                                rollup.steps.map((s) => [
                                    `step_${s.sequence_index + 1}`,
                                    { item_status: s.item_status, form_submission_id: s.form_submission_id },
                                ])
                            )}
                        />
                    </div>
                : null}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <TechnicalDetailJsonBlock title="Launch context" value={technicalDetails.launch_context} />
                    <TechnicalDetailJsonBlock title="CRM snapshot" value={technicalDetails.crm_snapshot} />
                </div>
                <TechnicalDetailJsonBlock title="Shared values" value={technicalDetails.shared_values} />
            </TechnicalDetailDisclosure>
        </FormsTechnicalDetailStack>
    );
}
