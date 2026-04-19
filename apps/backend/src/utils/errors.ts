export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const Errors = {
  unauthorized: (msg = "Unauthorized") => new ApiError(401, "UNAUTHORIZED", msg),
  forbidden: (msg = "Forbidden") => new ApiError(403, "FORBIDDEN", msg),
  notFound: (msg = "Not found") => new ApiError(404, "NOT_FOUND", msg),
  badRequest: (msg = "Bad request", details?: unknown) => new ApiError(400, "BAD_REQUEST", msg, details),
  conflict: (msg = "Conflict") => new ApiError(409, "CONFLICT", msg),
  rateLimit: (msg = "Rate limit exceeded") => new ApiError(429, "RATE_LIMITED", msg),
  invalidAccessToken: () => new ApiError(401, "INVALID_ACCESS_TOKEN", "Invalid access token"),
  invalidPublicToken: () => new ApiError(400, "INVALID_PUBLIC_TOKEN", "Invalid or consumed public token"),
  invalidLinkToken: () => new ApiError(400, "INVALID_LINK_TOKEN", "Invalid or expired link token"),
  invalidClient: () => new ApiError(401, "INVALID_CLIENT", "Invalid client credentials"),
  itemError: (status: string) => new ApiError(400, "ITEM_ERROR", `Item is in ${status} state`),
};
