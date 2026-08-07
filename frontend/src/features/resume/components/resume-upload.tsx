"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";

import { useResumeUpload } from "../hooks/use-resume-upload";

export function ResumeUpload() {
  const { getToken } = useAuth();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isOpeningId, setIsOpeningId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const {
    startUpload,
    isUploading,
    error,
    successMessage,
    resumes,
    refresh,
    isLoadingResumes,
    deleteResume,
    isDeleting,
  } = useResumeUpload();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleView = useCallback(
    async (resumeId: number) => {
      setIsOpeningId(resumeId);

      try {
        const token = await getToken();
        if (!token) {
          throw new Error("Not authenticated");
        }

        const apiBase =
          process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

        const response = await fetch(
          `${apiBase}/resumes/${resumeId}/download`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          const text = await response.text().catch(() => "");
          throw new Error(text || "Failed to open resume");
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Failed to open resume";
        window.alert(message);
      } finally {
        setIsOpeningId(null);
      }
    },
    [getToken]
  );

  const closePreview = useCallback(() => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
  }, [previewUrl]);


  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || e.target.files.length === 0) return;
      const files = Array.from(e.target.files);
      startUpload(files);
    },
    [startUpload]
  );

  return (
    <div className="space-y-6 cursor-default select-none">
      <div 
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/60 hover:border-primary/40 hover:bg-primary/5 rounded-2xl max-w-md mx-auto bg-card/70 backdrop-blur-xl cursor-pointer transition-all duration-200 select-none"
      >
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Upload your Resume
        </h3>
        <p className="text-xs text-muted-foreground mb-4">PDF/DOCX files only (Max 10MB)</p>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="cursor-pointer bg-primary hover:bg-primary/95 text-primary-foreground text-sm font-medium py-2 px-4 rounded-xl transition-colors duration-200 disabled:opacity-50"
        >
          {isUploading ? "Uploading & Syncing..." : "Choose PDF File"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          disabled={isUploading}
        />

        {successMessage && (
          <p className="text-sm text-success mt-3 font-medium text-center">
            {successMessage}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive mt-3 font-medium text-center">
            {error}
          </p>
        )}
      </div>

      <div className="max-w-3xl mx-auto">
        <h4 className="text-sm font-semibold text-foreground mb-3">Your resumes</h4>

        {isLoadingResumes ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : resumes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No resumes uploaded yet.</p>
        ) : (
          <div className="space-y-2">
            {resumes.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-4 p-4 border border-border rounded-2xl bg-card/70 backdrop-blur-xl cursor-default select-none"
              >
                <div className="min-w-0">
                  <div className="font-medium text-foreground truncate">
                    {r.file_name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Uploaded: {new Date(r.created_at).toLocaleString()}
                  </div>
                  <div className="text-xs text-muted-foreground">Status: {r.status}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleView(r.id)}
                    disabled={isOpeningId === r.id}
                    className="shrink-0 inline-flex items-center justify-center rounded-xl bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/95 disabled:opacity-50"
                  >
                    {isOpeningId === r.id ? "Opening..." : "View"}
                  </button>

                  <button
                    type="button"
                    onClick={() => deleteResume(r.id)}
                    disabled={isDeleting}
                    className="shrink-0 inline-flex items-center justify-center rounded-xl bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/95 disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900">
            <span className="text-white text-sm font-medium">Resume Preview</span>
            <button
              type="button"
              onClick={closePreview}
              className="text-white hover:text-gray-300 text-sm font-medium px-3 py-1 rounded border border-gray-600 hover:border-gray-400 transition-colors"
            >
              Close
            </button>
          </div>
          <iframe
            src={previewUrl}
            className="flex-1 w-full border-0"
            title="Resume Preview"
          />
        </div>
      )}
    </div>
  );
}


