import Link from "next/link";
import Image from "next/image";
import Section from "@/components/Section";
import PrimaryButton from "@/components/PrimaryButton";
import CleaningQuoteForm from "@/components/cleaning/CleaningQuoteForm";
import SecondaryButton from "@/components/SecondaryButton";
import ServiceCard from "@/components/ServiceCard";
import Accordion from "@/components/Accordion";
import BrandValueCard from "@/components/BrandValueCard";
import { SERVICES } from "@/lib/services";

export default function Home() {
  const howItWorksSteps = [
    {
      number: "1",
      title: "Tell us what you need — nothing more",
      description: "Share your home size and schedule. No endless back-and-forth — just enough detail for us to handle the rest.",
    },
    {
      number: "2",
      title: "Coordinated by people, backed by tech",
      description: "Real humans review every job. Technology speeds things up — people make the call and keep things on track.",
    },
    {
      number: "3",
      title: "Confirmed by text. Covered by Alloy.",
      description: "We text the details. You confirm. And we stay involved — if something's not right, we make it right.",
    },
  ];

  const whyAlloyIsDifferent = [
    {
      title: "Trust First",
      description: "Every pro is vetted, insured, and background-checked. We stand behind every job. If something's not right, we fix it.",
      accentColor: "juniper" as const,
    },
    {
      title: "Dead-Simple",
      description: "No apps. No endless forms. No confusing booking systems. Tell us what you need, confirm by text, and you're done.",
      accentColor: "juniper" as const,
    },
    {
      title: "Human + Smart",
      description: "Real people who know Bend and care about getting it right, supported by technology that makes coordination faster and more reliable.",
      accentColor: "juniper" as const,
    },
    {
      title: "We don't sell your information",
      description: "Your information stays with us. We coordinate directly with a pro we know and trust. No lead blasting, no spam calls, no middleman chaos.",
      accentColor: "juniper" as const,
    },
  ];

  const testimonials = [
    {
      quote:
        "Alloy Services is a new local home services company, and I've been impressed with how thoughtfully they're approaching things from the start. They're clearly focused on quality, reliability, and creating a professional experience for homeowners.",
      name: "Sarah M.",
      relation: "Early supporter",
      location: null,
    },
    {
      quote:
        "What stood out to me about Alloy Services is how intentional they are about handling everything end-to-end — from customer intake to service execution and follow-up. It feels like a modern, well-run operation.",
      name: "James R.",
      relation: "Early supporter",
      location: null,
    },
    {
      quote:
        "Alloy Services is building something really solid. I appreciate their focus on clear communication, consistency, and supporting the people doing the work.",
      name: "Emily T.",
      relation: "Early supporter",
      location: null,
    },
  ];

  const faqs = [
    {
      question: "How does Alloy work?",
      answer:
        "You tell us what you need, we coordinate with a vetted local pro, and you confirm by text. No apps, no complicated booking. We handle the rest.",
    },
    {
      question: "Are the professionals insured?",
      answer:
        "Yes. Every pro is insured, background-checked, and verified before they can accept jobs. We stand behind every job.",
    },
    {
      question: "What areas do you serve?",
      answer:
        "We're focused on Bend, Oregon right now. We'll expand to surrounding areas as we grow.",
    },
    {
      question: "How do I pay?",
      answer:
        "We save your payment information during booking and only charge you at the completion of the service, once you've confirmed the work was completed.",
    },
    {
      question: "Do I need to be home during the cleaning?",
      answer:
        "No. We'll coordinate access with you beforehand. We're flexible to your preference.",
    },
    {
      question: "What if I'm not satisfied with the cleaning?",
      answer:
        "We make it right. If something isn't up to your standards, let us know within 24 hours and we'll send the pro back to fix it at no extra charge.",
    },
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-alloy-stone">
        <div className="mx-auto max-w-6xl px-4 md:px-8 py-6 md:py-10">
          <div className="relative min-h-[420px] md:h-[400px] lg:h-[460px] overflow-hidden rounded-xl shadow-lg">
            {/* Background Image */}
            <Image
              src="/hero/cleaning-hero.jpeg"
              alt="Clean modern home interior"
              fill
              priority
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 90vw, 1152px"
            />

            {/* Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-r from-alloy-midnight/60 via-alloy-midnight/25 to-transparent" />

            {/* Content Overlay */}
            <div className="relative z-10 flex min-h-[420px] md:h-full items-center py-8 md:py-0 px-4 md:px-10 lg:px-12">
              <div className="max-w-xl space-y-3 md:space-y-6 w-full">
                <p className="text-xs md:text-sm font-medium text-alloy-juniper uppercase tracking-wide bg-white/20 backdrop-blur-sm px-3 py-1.5 rounded-full inline-block">
                  Born in Bend. Built for trust.
                </p>
                <h1 className="text-3xl md:text-5xl lg:text-5xl font-bold text-white leading-tight">
                  Trusted home services, without the runaround.
          </h1>
                <p className="text-base md:text-lg text-white/90">
                  Alloy handles everything from scheduling, confirmation, and follow-up, using trusted local professionals in Bend. One point of contact. Real accountability.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <Link href="/services/cleaning?open=1#quote-form">
                    <PrimaryButton className="w-full sm:w-auto">
                      Get a cleaning quote
                    </PrimaryButton>
                  </Link>
                  <Link href="#how-it-works">
                    <SecondaryButton className="!bg-white/20 backdrop-blur-md !border !border-white/50 !text-white hover:!bg-white/30 w-full sm:w-auto">
                      See how Alloy works
                    </SecondaryButton>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How Alloy Makes It Easy */}
      <Section id="how-it-works" className="py-8 md:py-10 bg-alloy-stone">
        <h2 className="text-2xl md:text-3xl font-bold text-alloy-pine text-center mb-8 md:mb-12">
          How Alloy Makes It Easy
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {howItWorksSteps.map((step) => (
            <div key={step.number} className="text-center">
              <div className="w-14 h-14 md:w-16 md:h-16 bg-alloy-juniper text-white rounded-full flex items-center justify-center text-xl md:text-2xl font-bold mx-auto mb-3 md:mb-4 shadow-md">
                {step.number}
              </div>
              <h3 className="text-lg md:text-xl font-semibold text-alloy-pine mb-2">
                {step.title}
              </h3>
              <p className="text-sm md:text-base text-alloy-midnight/80">{step.description}</p>
            </div>
          ))}
        </div>
        <div className="max-w-3xl mx-auto mt-8 md:mt-12 text-center">
          <div className="bg-white/80 rounded-lg p-4 md:p-6 border border-alloy-stone/30">
            <p className="text-base md:text-lg text-alloy-midnight font-medium">
              Alloy provides home cleaning in Bend & Central Oregon, without the runaround. We handle scheduling, confirmation, and follow-up, and we stay involved from start to finish. Our goal is to keep the process simple, offer a first class experience, and ensure you always have one point of contact.
            </p>
          </div>
        </div>
      </Section>

      {/* Current Services */}
      <Section className="py-12 md:py-20">
        <h2 className="text-2xl md:text-3xl font-bold text-alloy-pine text-center mb-4">
          Services we offer
        </h2>
        <p className="text-center text-sm md:text-base text-alloy-midnight/80 mb-8 md:mb-12">
          Home cleaning is available now. More services coming soon.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SERVICES.map((service) => (
            <ServiceCard key={service.id} service={service} />
          ))}
        </div>
      </Section>

      {/* Why Alloy Is Different */}
      <Section className="py-12 md:py-20 bg-white">
        <h2 className="text-2xl md:text-3xl font-bold text-alloy-pine text-center mb-6 md:mb-4">
          Why Alloy Is Different
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-5xl mx-auto">
          {whyAlloyIsDifferent.map((value) => (
            <BrandValueCard
              key={value.title}
              title={value.title}
              description={value.description}
              accentColor={value.accentColor}
              icon={
                <svg
                  className="w-8 h-8"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
            />
          ))}
        </div>
      </Section>

      {/* Testimonials */}
      <Section className="py-12 md:py-20 bg-alloy-pine/5">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-bold text-alloy-pine text-center mb-3">
            What people are saying about Alloy
          </h2>
          <p className="text-sm md:text-base text-alloy-midnight/70 text-center mb-8 md:mb-12">
            Early supporters — customer reviews coming soon.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8 md:mb-12">
            {testimonials.map((testimonial, index) => (
              <div
                key={index}
                className="bg-white rounded-2xl shadow-md p-5 md:p-6 border border-alloy-stone/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
              >
                {/* 5-star rating */}
                <div className="flex gap-0.5 mb-4">
                  {[...Array(5)].map((_, i) => (
                    <svg
                      key={i}
                      className="w-4 h-4 text-alloy-juniper"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-sm md:text-base text-alloy-midnight/80 mb-4 leading-relaxed">
                  &quot;{testimonial.quote}&quot;
                </p>
                <div className="pt-4 border-t border-alloy-stone/20">
                  <p className="text-sm md:text-base font-semibold text-alloy-pine">
                    — {testimonial.name}
                  </p>
                  <p className="text-xs md:text-sm text-alloy-midnight/60 mt-1">
                    {testimonial.relation}
                    {testimonial.location && ` • ${testimonial.location}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link href="/services/cleaning?open=1#quote-form">
              <PrimaryButton className="w-full sm:w-auto">
                Get a same-day quote
              </PrimaryButton>
            </Link>
            <p className="text-sm text-alloy-midnight/60 mt-6">
              Had a great experience?{" "}
              <a
                href="https://www.google.com/search?sca_esv=7670df6d756a93b6&sxsrf=AE3TifNkBI028mC6V8lu01Pi7_VO0zSISw:1767651952450&si=AMgyJEtREmoPL4P1I5IDCfuA8gybfVI2d5Uj7QMwYCZHKDZ-E1vaBZPzHkn18HCW9v8UVy2cjwvDEtsPTjI29B5Ok2Wd7GZcsLRus5HtywFRGe9rcAgM3BMkhEoX69tYnzEXHihFmtQ-&q=Alloy+Services+Reviews&sa=X&ved=2ahUKEwjxmNnVuPWRAxU8JDQIHRExOEIQ0bkNegQILxAD#lrd=0x12915f0438ac783:0x94b6c943526afd86,3,,,,"
                target="_blank"
                rel="noopener noreferrer"
                className="text-alloy-juniper hover:text-alloy-pine underline transition-colors"
              >
                Leave us a Google review
              </a>
            </p>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section className="py-12 md:py-20 bg-white">
        <h2 className="text-2xl md:text-3xl font-bold text-alloy-midnight text-center mb-8 md:mb-12">
          Frequently Asked Questions
        </h2>
        <div className="max-w-3xl mx-auto">
          {faqs.map((faq) => (
            <Accordion key={faq.question} title={faq.question}>
              <p>{faq.answer}</p>
            </Accordion>
          ))}
        </div>
      </Section>

      {/* Final CTA – Cleaning quote form (Phase 1: frontend-only) */}
      <Section className="py-10 md:py-12 lg:py-16">
        <div className="bg-alloy-blue rounded-lg p-5 md:p-6 lg:p-8 text-center text-white">
          <h2 className="text-2xl md:text-3xl font-bold mb-3 md:mb-4">Ready to get started?</h2>
          <p className="text-base md:text-lg mb-5 md:mb-6 opacity-90">
            Tell us about your home and schedule. We&apos;ll calculate a transparent quote and text
            you to confirm details.
          </p>
          <div className="max-w-3xl mx-auto text-left">
            <CleaningQuoteForm variant="dark" />
          </div>
        </div>
      </Section>
    </div>
  );
}
