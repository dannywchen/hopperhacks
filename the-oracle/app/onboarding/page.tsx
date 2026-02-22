import { Suspense } from "react";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import LogoutButton from "@/components/ui/logout-button";

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="mystic-bg min-h-screen" />}>
      <div className="absolute top-4 right-4 z-50">
        <LogoutButton />
      </div>
      <OnboardingWizard />
    </Suspense>
  );
}