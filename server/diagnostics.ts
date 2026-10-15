import { SupabaseUnavailableError } from "./supabase.js";

export function logFailure(error: unknown, context: string, requestId: string) {
  const category = error instanceof SupabaseUnavailableError ? error.code : "APPLICATION_ERROR";
  console.error(JSON.stringify({ event: "labtrack_failure", context, requestId, category }));
}
