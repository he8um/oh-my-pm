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

// Bounds for optional item conversation comments. At most 50 comments are ever
// normalized; each comment body is bounded to 8,000 characters and the combined
// comment bodies to 64,000 characters. Excess comments/characters are dropped
// with a stable warning; earlier comments are always preserved first.
export const GITHUB_MAX_COMMENTS = 50;
export const GITHUB_MAX_COMMENT_BODY_CHARS = 8_000;
export const GITHUB_MAX_COMBINED_COMMENT_CHARS = 64_000;

// Bounds for optional pull-request review submissions. At most 20 reviews are
// ever normalized; each review body is bounded to 6,000 characters and the
// combined review bodies to 32,000 characters. Excess reviews/characters are
// dropped with a stable warning; earlier reviews are always preserved first.
export const GITHUB_MAX_REVIEWS = 20;
export const GITHUB_MAX_REVIEW_BODY_CHARS = 6_000;
export const GITHUB_MAX_COMBINED_REVIEW_CHARS = 32_000;

// Bounds for optional inline pull-request review comments. At most 20 review
// comments are ever normalized; each body is bounded to 8,000 characters and
// the combined review-comment bodies to 48,000 characters. The display file
// path is bounded to 512 characters. Excess records/characters are dropped with
// a stable warning; earlier review comments are always preserved first.
export const GITHUB_MAX_REVIEW_COMMENTS = 20;
export const GITHUB_MAX_REVIEW_COMMENT_BODY_CHARS = 8_000;
export const GITHUB_MAX_COMBINED_REVIEW_COMMENT_CHARS = 48_000;
export const GITHUB_MAX_REVIEW_COMMENT_PATH_CHARS = 512;

/** Canonical Accept media type for the REST API. */
export const GITHUB_ACCEPT = "application/vnd.github+json";

/** Only the api.github.com host is ever contacted. */
export const GITHUB_API_HOSTNAME = "api.github.com";
