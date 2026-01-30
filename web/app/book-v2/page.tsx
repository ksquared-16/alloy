import { Suspense } from "react";
import Section from "@/components/Section";
import BookV2Client from "./BookV2Client";
import BookPrefillPersist from "../book/BookPrefillPersist";

export default function BookV2Page() {
    return (
        <>
            <Suspense fallback={null}>
                <BookPrefillPersist />
            </Suspense>
            <Suspense fallback={
                <div className="min-h-screen py-6 md:py-10">
                    <Section className="max-w-5xl">
                        <div className="bg-white rounded-2xl overflow-hidden border border-alloy-stone/20 shadow-sm p-4 md:p-6">
                            <div className="min-h-[600px] flex items-center justify-center">
                                <p className="text-alloy-midnight/70">Loading...</p>
                            </div>
                        </div>
                    </Section>
                </div>
            }>
                <BookV2Client />
            </Suspense>
        </>
    );
}

