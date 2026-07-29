export function databaseFailure(
  operation: string,
  error: unknown,
  publicMessage = "The change could not be saved. Try again.",
) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? error.code
      : "unknown";
  console.error("Database operation failed.", { operation, code });
  return { error: publicMessage };
}
