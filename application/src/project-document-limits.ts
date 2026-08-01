// Bounded local project-document limits.
//
// Pure numeric defaults with no Node dependency, so the core application
// surface (request construction, config validation) can reference them without
// pulling in the Node document loader. The Node loader in `node/` applies them.

/** Maximum number of Markdown documents loaded from a project root. */
export const DEFAULT_PROJECT_DOCUMENT_MAX_FILES = 200;
/** Maximum size of a single loaded document, in bytes. */
export const DEFAULT_PROJECT_DOCUMENT_MAX_BYTES_PER_FILE = 256 * 1024;
/** Maximum combined size of all loaded documents, in bytes. */
export const DEFAULT_PROJECT_DOCUMENT_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
