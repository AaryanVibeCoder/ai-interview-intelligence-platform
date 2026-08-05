import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Get the current authenticated user
 * Use in Server Components or API routes
 */
export async function getCurrentUser() {
  try {
    const user = await currentUser();
    return user;
  } catch (error) {
    console.error("Error getting current user:", error);
    return null;
  }
}

/**
 * Get the current auth session
 * Use in Server Components or API routes
 */
export async function getAuthSession() {
  try {
    const { userId, sessionId } = await auth();
    return { userId, sessionId };
  } catch (error) {
    console.error("Error getting auth session:", error);
    return null;
  }
}

/**
 * Check if user is authenticated
 * Use in Server Components or API routes
 */
export async function isAuthenticated() {
  try {
    const { userId } = await auth();
    return !!userId;
  } catch (error) {
    console.error("Error checking authentication:", error);
    return false;
  }
}

/**
 * Format user display name
 */
export function formatUserName(
  firstName?: string | null,
  lastName?: string | null,
  email?: string | null,
) {
  if (firstName && lastName) {
    return `${firstName} ${lastName}`;
  }

  if (firstName) {
    return firstName;
  }

  if (email) {
    return email.split("@")[0];
  }

  return "User";
}

/**
 * Get user initials for avatar
 */
export function getUserInitials(
  firstName?: string | null,
  lastName?: string | null,
) {
  const first = (firstName ?? "").charAt(0).toUpperCase();
  const last = (lastName ?? "").charAt(0).toUpperCase();
  return `${first}${last}` || "U";
}
