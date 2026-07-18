// Fixed GitHub REST API baseline. These constants pin the provider to a single
// origin and API version; there is no custom-origin or Enterprise support in
// this phase. The User-Agent product version is supplied by the process
// adapter at transport-construction time and is never hard-coded here.

export const GITHUB_API_ORIGIN = "https://api.github.com";
export const GITHUB_API_VERSION = "2026-03-10";
export const GITHUB_DEFAULT_LIMIT = 50;
export const GITHUB_MAX_LIMIT = 100;
export const GITHUB_REQUEST_TIMEOUT_MS = 15_000;
export const GITHUB_MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const GITHUB_MAX_BODY_CHARS = 32_000;

/** Canonical Accept media type for the REST API. */
export const GITHUB_ACCEPT = "application/vnd.github+json";

/** Only the api.github.com host is ever contacted. */
export const GITHUB_API_HOSTNAME = "api.github.com";
