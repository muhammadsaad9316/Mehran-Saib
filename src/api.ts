export async function api<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const request: RequestInit = {
    credentials: "same-origin",
    ...options,
    headers: {
      ...(options.body instanceof FormData
        ? {}
        : { "Content-Type": "application/json" }),
      ...options.headers,
    },
  };
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`/api${path}`, request);
    const result = await response.json().catch(() => null);
    const restarting = !result && [500, 502, 503].includes(response.status);
    // Retry reads during a local proxy restart; writes must never be replayed.
    if (
      restarting &&
      (options.method || "GET").toUpperCase() === "GET" &&
      attempt < 3 &&
      !options.signal?.aborted
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
              ? "The local API is restarting. Try again in a moment."
              : `Request failed (${response.status})`),
        ),
        { status: response.status },
      );
    return result ?? {};
  }
}
export function saveFile(name: string, content: string, type = "text/plain") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
