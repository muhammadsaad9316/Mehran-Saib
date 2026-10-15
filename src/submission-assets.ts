import { useEffect, useState } from "react";
import type { Submission } from "../shared/types";
import { api } from "./api";

export function useSubmissionAssets(submission: Submission) {
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [assetError, setAssetError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setAssets({}); setAssetError("");
    const queue = [...(submission.assets || [])];
    const worker = async () => {
    while (queue.length && !controller.signal.aborted) {
      const asset = queue.shift()!;
      try {
      const blob = await api<Blob>(`/submissions/${submission.id}/files/${asset.path.split("/").map(encodeURIComponent).join("/")}?revision=${submission.revision}`, { signal: controller.signal, responseType: "blob" });
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Could not read ${asset.path}`));
        reader.readAsDataURL(blob);
      });
      if (active) setAssets(previous => ({ ...previous, [asset.path]: content }));
      } catch (cause) {
        if (active) setAssetError(cause instanceof Error ? cause.message : "Some image assets could not be loaded. Reopen this task to retry.");
      }
    }
    };
    void Promise.all(Array.from({ length: Math.min(4, queue.length) }, worker));
    return () => { active = false; controller.abort(); };
  }, [submission.id, submission.revision]);
  return { assets, assetError };
}
