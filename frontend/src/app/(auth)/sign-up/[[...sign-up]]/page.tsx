import { SignUp } from "@clerk/nextjs";
import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up | ElevateIQ",
  description: "Create a new ElevateIQ account",
};

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Join ElevateIQ</h1>
          <p className="mt-2 text-slate-400">Create an account to get started</p>
        </div>

        <div className="rounded-lg bg-white shadow-lg p-8">
          <SignUp
            routing="path"
            path="/sign-up"
            signInUrl="/sign-in"
            appearance={{
              elements: {
                rootBox: "w-full",
                card: "shadow-none bg-transparent",
                header__title: "text-2xl font-bold text-slate-900",
                header__subtitle: "text-slate-600",
                socialButtonsBlockButton: "border-slate-300 hover:bg-slate-50",
                socialButtonsBlockButton__text: "text-slate-700 font-medium",
                dividerLine: "bg-slate-200",
                dividerText: "text-slate-600",
                formFieldLabel: "text-slate-700 font-medium",
                formFieldInput:
                  "border-slate-300 focus:border-slate-900 focus:ring-slate-900",
                formButtonPrimary:
                  "bg-slate-900 hover:bg-slate-800 text-white font-medium",
                footerActionLink: "text-slate-600 hover:text-slate-900",
                identity__inputGroup: "gap-3",
              },
            }}
          />
        </div>

        <p className="mt-6 text-center text-sm text-slate-400">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-white hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
