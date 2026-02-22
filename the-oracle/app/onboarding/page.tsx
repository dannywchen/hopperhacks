import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="mystic-bg min-h-screen" />}>
      <OnboardingWizard />
    </Suspense>
  );
}
