import type { GlobalSearchResultPill } from "@/lib/admin/globalSearch/globalRecordSearchResultPresentation";
import { brand } from "@/styles/tokens/colors";

type Props = {
    pill: GlobalSearchResultPill | null;
};

/** Status-only pill — the only colored element in global search rows (V1 closeout). */
export default function GlobalSearchStatusPill({ pill }: Props) {
    if (!pill) return null;
    return (
        <span
            className="inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium leading-tight ring-1 ring-alloy-pine/15"
            style={{ backgroundColor: "rgba(0, 162, 131, 0.07)", color: brand.secondary }}
        >
            {pill.label}
        </span>
    );
}
