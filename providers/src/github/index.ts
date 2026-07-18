// Public surface of the GitHub read-only provider.

export {
  GITHUB_ACCEPT,
  GITHUB_API_HOSTNAME,
  GITHUB_API_ORIGIN,
  GITHUB_API_VERSION,
  GITHUB_DEFAULT_LIMIT,
  GITHUB_MAX_BODY_CHARS,
  GITHUB_MAX_LIMIT,
  GITHUB_MAX_RESPONSE_BYTES,
  GITHUB_REQUEST_TIMEOUT_MS,
} from "./constants.js";
export {
  parseGitHubFetchQuery,
  parseGitHubListQuery,
  parseGitHubRepository,
  parseGitHubSearchQuery,
} from "./query.js";
export {
  normalizeIssue,
  normalizeIssueOrPullRequest,
  normalizePullRequest,
  normalizeRepository,
  readPullRequestDetail,
} from "./normalize.js";
export type { GitHubNormalizedResult, PullRequestDetail } from "./normalize.js";
export { createNodeGitHubHttpTransport, GitHubTransportError } from "./transport.js";
export { createGitHubProvider } from "./provider.js";
export type {
  GitHubFetchQueryResult,
  GitHubHttpRequest,
  GitHubHttpResponse,
  GitHubHttpTransport,
  GitHubListQueryResult,
  GitHubRepositoryRef,
  GitHubRepositoryRefResult,
  GitHubSearchQueryResult,
} from "./types.js";
