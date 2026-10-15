interface ApiOptions extends RequestInit {
  timeoutMs?: number;
  responseType?: "json" | "blob";
}
export async function api<T = unknown>(
  path: string,
  options: ApiOptions = {},
): Promise<T> {
  const { timeoutMs, responseType = "json", ...fetchOptions } = options;
  const read = ["GET", "HEAD"].includes((options.method || "GET").toUpperCase());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs ?? (read ? 20000 : 50000));
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const request: RequestInit = {
    credentials: "same-origin",
    ...fetchOptions,
    signal,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  };
  try {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`/api${path}`, request);
    const result = response.ok && responseType === "blob" ? await response.blob() : await response.json().catch(() => {
      if (signal.aborted) throw new Error("Request cancelled.");
      return null;
    });
    const restarting = !result && [500, 502, 503].includes(response.status);
    // Retry reads during a local proxy restart; writes must never be replayed.
    if (
      restarting &&
      read &&
      attempt < 3 &&
      !signal.aborted
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    if (!response.ok)
      throw Object.assign(
        new Error(
          result?.error ||
            result?.message ||
            (restarting
              ? "The workspace is temporarily unavailable. Try again in a moment."
              : `Request failed (${response.status})`),
        ),
        { status: response.status },
      );
    if (result === null) throw new Error("The server returned an incomplete response.");
    return result as T;
  }
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (controller.signal.aborted)
      throw Object.assign(new Error(read ? "The request timed out. Try refreshing the workspace." : "The save could not be confirmed before the timeout. Refresh the workspace before repeating it."), { uncertain: !read });
    if (!read && !(error as { status?: number }).status)
      throw Object.assign(new Error("The save could not be confirmed. Refresh the workspace before repeating it."), { uncertain: true });
    throw error;
  } finally { clearTimeout(timer); }
}
export function saveFile(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
