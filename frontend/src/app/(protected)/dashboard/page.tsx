import { ResumeUpload } from "@/features/resume/components/resume-upload";
import { StartPracticeSection } from "@/features/interview/components/StartPracticeSection";
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
        <h1 className="text-3xl font-bold tracking-tight">Welcome, {displayName}!</h1>
        <p className="mt-2 text-muted-foreground">
          This is your dashboard. You&apos;ll find all your content and workspace here.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Dashboard cards will go here */}
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Getting Started</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Explore the dashboard and customize your workspace.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Documentation</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Learn how to use ElevateIQ to its full potential.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <h3 className="font-semibold">Support</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Need help? Check out our support resources.
          </p>
        </div>

        <div className="md:col-span-2 lg:col-span-3">
          <StartPracticeSection />
        </div>

        <div className="md:col-span-2 lg:col-span-3">
          <ResumeUpload />
        </div>
      </div>
    </div>
  );
}

