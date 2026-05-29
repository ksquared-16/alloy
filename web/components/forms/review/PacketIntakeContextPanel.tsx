import type { PacketReviewRollupV1 } from "@/lib/forms/packets/packetReviewRollupTypes";
import { CaseFileSection } from "@/components/forms/review/CaseFileSection";
import { FORMS_CASE_FILE_SECTION } from "@/lib/forms/review/formsReviewPresentation";
import { opContextLabel, opContextValue } from "@/lib/operational/ui/operationalVisualTokens";

type Props = {
    rollup: PacketReviewRollupV1;
};

function launchSurfaceLabel(surface: string | null): string | null {
    if (surface === "crm_opportunity") return "Launched from a CRM opportunity";
    if (surface) return `Launch: ${surface.replace(/_/g, " ")}`;
    return null;
}

export function PacketIntakeContextPanel({ rollup }: Props) {
    const ctx = rollup.enrollment_context;
    const launch = launchSurfaceLabel(ctx.launch_surface);

    return (
        <CaseFileSection
            id={FORMS_CASE_FILE_SECTION.intakeContext}
            title="Intake context"
            variant="context"
            description="Who this submission is for and how the packet was sent."
        >
            <ul className={opContextValue}>
                {ctx.opportunity_label ?
                    <li>
                        <span className={opContextLabel}>Customer / case:</span> {ctx.opportunity_label}
                    </li>
                : null}
                {ctx.customer_label ?
                    <li>
                        <span className={opContextLabel}>Customer:</span> {ctx.customer_label}
                    </li>
                : null}
                {launch ?
                    <li>{launch}</li>
                : null}
                {!ctx.opportunity_label && !ctx.customer_label ?
                    <li>Subject details will appear when the packet is linked to CRM records.</li>
                : null}
            </ul>
        </CaseFileSection>
    );
}
