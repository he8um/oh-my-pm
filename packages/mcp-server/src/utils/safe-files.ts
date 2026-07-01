import { readFile } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";

// Read a file safely within the project root. Returns null if the file does
// not exist or is outside the project root. Never throws on ENOENT.
export async function safeReadFile(
  projectRoot: string,
  relativePath: string
): Promise<string | null> {
  const absolute = resolve(projectRoot, relativePath);
  const rel = relative(projectRoot, absolute);

  // Reject path traversal attempts
  if (rel.startsWith("..") || isAbsolute(rel)) {
    process.stderr.write(`Rejected path traversal attempt: ${relativePath}\n`);
    return null;
  }

  // Reject sensitive file patterns
  const SENSITIVE = /(\.env|\.key|\.pem|\.p12|secret|credential|password|token)/i;
  if (SENSITIVE.test(relativePath)) {
    process.stderr.write(`Rejected sensitive file pattern: ${relativePath}\n`);
    return null;
  }

  try {
    return await readFile(absolute, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// Get the project root from the environment variable or cwd.
export function getProjectRoot(): string {
  return process.env["OH_MY_PM_PROJECT_ROOT"] ?? process.cwd();
}
