import { Metadata } from "next";
import { currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { formatUserName, getUserInitials } from "@/utils/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export const metadata: Metadata = {
  title: "Profile | ElevateIQ",
  description: "Your profile information",
};

export default async function ProfilePage() {
  const user = await currentUser();

  if (!user) {
    redirect("/sign-in");
  }

  const displayName = formatUserName(user.firstName, user.lastName, user.primaryEmailAddress?.emailAddress);
  const initials = getUserInitials(user.firstName, user.lastName);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-2 text-muted-foreground">
          Manage your profile information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account Information</CardTitle>
          <CardDescription>Your personal details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {user.imageUrl && (
                <AvatarImage src={user.imageUrl} alt={displayName} />
              )}
              <AvatarFallback className="bg-slate-900 text-white text-lg font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-lg font-semibold">{displayName}</p>
              <p className="text-sm text-muted-foreground">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>
          </div>

          <div className="border-t pt-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">First Name</h3>
              <p className="mt-1 text-sm font-medium">
                {user.firstName || "Not provided"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Last Name</h3>
              <p className="mt-1 text-sm font-medium">
                {user.lastName || "Not provided"}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Email Address</h3>
              <p className="mt-1 text-sm font-medium">
                {user.primaryEmailAddress?.emailAddress}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground">User ID</h3>
              <p className="mt-1 text-sm font-mono text-xs">
                {user.id}
              </p>
            </div>

            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Account Created</h3>
              <p className="mt-1 text-sm font-medium">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
