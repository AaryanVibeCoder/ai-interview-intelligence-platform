import { useCallback, useMemo, useState } from "react";

import { useAuth } from "@clerk/nextjs";

import { apiClient } from "@/services/api/client";

import type { ResumeResponse, ResumeDeleteResponse } from "../types";

type ResumeListResponse = { resumes: ResumeResponse[] };

export function useResumeUpload() {
  const { getToken } = useAuth();

  const [isSavingToDb, setIsSavingToDb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [resumes, setResumes] = useState<ResumeResponse[]>([]);
  const [isLoadingResumes, setIsLoadingResumes] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);


  const fetchResumes = useCallback(async () => {
    setIsLoadingResumes(true);
    setError(null);
    try {
      const token = await getToken();

      // Defensive: Clerk can still be initializing on initial mount.
      // Only send Authorization if we have a valid-looking JWT string.
      const isValidJwtString =
        typeof token === "string" &&
        token.length > 0 &&
        token.split(".").length === 3;

      if (!isValidJwtString) {
        // Skip request; caller (or next retry) will run again when Clerk is ready.
        return;
      }

      const data = await apiClient.get<ResumeListResponse>("/resumes/", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      } as never);

      setResumes(data.resumes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load resumes";
      setError(message);
    } finally {
      setIsLoadingResumes(false);
    }
  }, [getToken]);

  const startUpload = async (files: File[]) => {
    const file = files?.[0];
    if (!file) return;

    setIsSavingToDb(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

      const response = await fetch(`${apiBase}/resumes/`, {
        method: "POST",
        body: formData,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || "Failed to upload resume to backend");
      }

      const newResume = await response.json();

      await fetchResumes();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("resume-uploaded", { detail: { newResume } }));
      }

      setSuccessMessage("Resume uploaded successfully!");
      window.setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
    } finally {
      setIsSavingToDb(false);
    }
  };

  const deleteResume = useCallback(
    async (id: number) => {
      setIsDeleting(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");

        const res = await apiClient.delete<ResumeDeleteResponse>(
          `/resumes/${id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          } as never
        );

        if (!res?.success) throw new Error("Delete failed");
        await fetchResumes();

        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("resume-deleted", { detail: { deletedId: id } }));
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to delete resume";
        setError(message);
      } finally {
        setIsDeleting(false);
      }
    },
    [fetchResumes, getToken]
  );

  const resumeState = useMemo(
    () => ({
      resumes,
      isLoadingResumes,
      isDeleting,
    }),
    [resumes, isLoadingResumes, isDeleting]
  );

  return {
    ...resumeState,
    startUpload,
    deleteResume,
    isUploading: isSavingToDb,
    error,
    successMessage,
    refresh: fetchResumes,
  };
}

