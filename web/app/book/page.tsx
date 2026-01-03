import { Suspense } from "react";
import Section from "@/components/Section";
import BookClient from "./BookClient";
import BookPrefillPersist from "./BookPrefillPersist";

export default function BookPage() {
    return (
        <>
            <BookPrefillPersist />
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
                        <div className="min-h-[1200px] md:min-h-[900px] flex items-center justify-center">
                            <p className="text-alloy-midnight/70">Loading calendar...</p>
                        </div>
                    </div>
                </Section>
            </div>
        }>
            <BookClient />
        </Suspense>
        </>
    );
}
