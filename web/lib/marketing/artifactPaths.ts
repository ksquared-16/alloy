/**
 * Deck artifact image paths for the public marketing site.
 * TODO: Replace placeholder SVGs with final deck exports when available.
 */
export const MARKETING_ARTIFACTS = {
  title: "/marketing/artifacts/title.svg",
  problem: "/marketing/artifacts/problem.svg",
  platformFoundation: "/marketing/artifacts/platform-foundation.svg",
  enrollmentWorkflow: "/marketing/artifacts/enrollment-workflow.svg",
  biggerPicture: "/marketing/artifacts/bigger-picture.svg",
  vision: "/marketing/artifacts/vision.svg",
} as const;

export type MarketingArtifactKey = keyof typeof MARKETING_ARTIFACTS;
