import { Suspense } from "react";
import Section from "@/components/Section";
import GhlEmbed from "@/components/GhlEmbed";
import BookClient from "./BookClient";

export default function BookPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen py-6 md:py-10">
                <Section className="max-w-5xl">
                    {process.env.NODE_ENV !== "production" && (
                        <div className="mb-4 p-4 bg-alloy-stone rounded-lg border border-alloy-stone/40">
                            <p className="text-sm font-mono text-alloy-midnight">
                                <strong>Debug phone param:</strong> Loading...
                            </p>
                        </div>
                    )}
                    <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                        <GhlEmbed
                            src="https://api.leadconnectorhq.com/widget/booking/GficiTFm4cbAbQ05IHwz?redirectUrl=https://www.workwithalloy.com/booking-thank-you"
                            title="Booking Calendar"
                            height={1200}
                            className="!min-h-[1200px] md:!min-h-[900px]"
                        />
                    </div>
                </Section>
            </div>
        }>
            <BookClient />
        </Suspense>
    );
}
