import { ResumeExamplesSection } from "@/components/dashboard/ResumeExamplesSection";
import { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "Resume Structure | ElevateIQ",
  description: "See what a strong, ATS-aligned resume looks like and follow step-by-step formatting guidelines.",
};

export default async function ResumeStructurePage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">Resume Structure</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          See what a strong, ATS-aligned resume looks like and follow the step-by-step formatting guidelines.
        </p>
      </div>

      <ResumeExamplesSection />
    </div>
  );
}
