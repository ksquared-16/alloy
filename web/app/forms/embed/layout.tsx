import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Form",
    robots: { index: false, follow: false },
};

/** Embed-only shell: no marketing chrome (see ConditionalSiteLayout + StagingBanner). */
export default function PublicFormEmbedLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="alloy-participant-surface min-h-screen bg-white text-neutral-900 antialiased">
            {children}
        </div>
    );
}
