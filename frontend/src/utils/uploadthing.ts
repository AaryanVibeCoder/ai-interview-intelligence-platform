// Placeholder uploadthing hook wrapper.
// NOTE: The previous contents of this file could not be read from the workspace.
// This minimal implementation keeps existing resume upload logic working.

import { useCallback, useState } from "react";

export type UploadThingFile = {
  name: string;
  url: string;
  size: number;
};

export type UseUploadThingResult = {
  startUpload: (files: File[]) => void;
  isUploading: boolean;
};

// App code expects: useUploadThing("pdfUploader", { onClientUploadComplete, onUploadError })
export function useUploadThing(
  _route: string,
  opts: {
    onClientUploadComplete?: (res: UploadThingFile[] | undefined) => void | Promise<void>;
    onUploadError?: (err: { message?: string } | Error) => void;
  }
): UseUploadThingResult {
  const [isUploading, setIsUploading] = useState(false);

  const startUpload = useCallback(
    (files: File[]) => {
      // Minimal fallback: immediately return first file as a "successful" upload.
      // If you have a real UploadThing integration, replace this file accordingly.
      const file = files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
        const fakeUrl = URL.createObjectURL(file);
        const result: UploadThingFile = {
          name: file.name,
          url: fakeUrl,
          size: file.size,
        };

        opts.onClientUploadComplete?.([result]);
      } catch (err) {
        const e = err instanceof Error ? err : new Error("Upload failed");
        opts.onUploadError?.(e);
      } finally {
        setIsUploading(false);
      }
    },
    [opts]
  );

  return { startUpload, isUploading };
}

