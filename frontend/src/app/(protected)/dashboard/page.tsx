import { ResumeUpload } from "@/features/resume/components/resume-upload";
import { StartPracticeSection } from "@/features/interview/components/StartPracticeSection";
import { GettingStartedCard } from "@/components/dashboard/GettingStartedCard";
import { DocumentationCard } from "@/components/dashboard/DocumentationCard";
import { SupportCard } from "@/components/dashboard/SupportCard";
import { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { formatUserName } from "@/utils/auth";

export const metadata: Metadata = {
  title: "Dashboard | ElevateIQ",
  description: "Your ElevateIQ dashboard",
};

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const displayName = formatUserName(user.firstName, user.lastName, user.primaryEmailAddress?.emailAddress);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Welcome, {displayName}!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is your dashboard. You&apos;ll find all your content and workspace here.
        </p>
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <GettingStartedCard />

        <DocumentationCard />

        <SupportCard />

        <div className="md:col-span-2 lg:col-span-3">
          <StartPracticeSection />
        </div>

        <div className="md:col-span-2 lg:col-span-3" id="resume-upload-section">
          <ResumeUpload />
        </div>
      </div>
    </div>
  );
}

