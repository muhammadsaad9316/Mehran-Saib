import { useEffect, useState } from "react";
import type { Submission } from "../shared/types";

export function useSubmissionAssets(submission: Submission) {
  const [assets, setAssets] = useState<Record<string, string>>({});
  const [assetError, setAssetError] = useState("");
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setAssets({}); setAssetError("");
    Promise.allSettled((submission.assets || []).map(async (asset) => {
      const response = await fetch(`/api/submissions/${submission.id}/files/${asset.path.split("/").map(encodeURIComponent).join("/")}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Could not load ${asset.path}`);
      const blob = await response.blob();
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error(`Could not read ${asset.path}`));
        reader.readAsDataURL(blob);
      });
      return [asset.path, content] as const;
    })).then((results) => {
      if (!active) return;
      setAssets(Object.fromEntries(results.flatMap((result) => result.status === "fulfilled" ? [result.value] : [])));
      if (results.some((result) => result.status === "rejected")) setAssetError("Some image assets could not be loaded. Retry by reopening this task.");
    });
    return () => { active = false; controller.abort(); };
  }, [submission.id, submission.revision]);
  return { assets, assetError };
}
