// Repository lint policy (ESLint 9 flat config).
//
// Scope and intent
// ----------------
// This policy exists to catch real defects -- unused bindings, unreachable
// code, duplicate imports, accidental globals, mishandled promises -- not to
// impose a stylistic rewrite. Formatting is Prettier's job (`pnpm format:check`)
// and is deliberately not duplicated here.
//
// What this policy does NOT do
// ----------------------------
// TypeScript already enforces types, and tools/validate-boundaries.mjs already
// enforces the architecture rules (which package may touch the filesystem, the
// network, child processes, process.stdout, or console) with far more precision
// than a lint rule could -- it knows, per file, which single adapter is allowed
// to write. Those checks are not re-implemented here. The one exception is
// `no-console` on the packages whose architecture forbids process output, kept
// as a cheap AST-level backstop that fires in the editor before CI does.

import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Generated, vendored, built, and installed output. Nothing here is authored by
// hand, so linting it would report defects nobody can fix at the source.
const IGNORES = [
  // Generated contracts and Kernel/WASM binding output.
  "contracts/generated/**",
  "kernel/binding/generated-node/**",
  "kernel/binding/wasm/**",
  // Build output.
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  // Rust build output.
  "target/**",
  // Release bundles, archives, and installed temporary prefixes.
  ".release/**",
  "release-artifacts/**",
  // Coverage.
  "coverage/**",
  "**/.nyc_output/**",
  // Dependencies.
  "**/node_modules/**",
  // Local-only development context (also gitignored).
  "_dev/**",
];

export default tseslint.config(
  { ignores: IGNORES },

  // Baseline correctness rules for every linted file, JS and TS alike.
  js.configs.recommended,

  // Type-aware TypeScript rules. `projectService` resolves each file through
  // the nearest tsconfig, which is what makes rules like no-floating-promises
  // possible; without type information those rules cannot run at all.
  //
  // Restricted to TypeScript: the .mjs tooling is covered by no tsconfig, and
  // pointing the project service at it produces "was not found by the project
  // service" parse errors rather than useful findings.
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
  })),
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    languageOptions: {
      parserOptions: {
        // Each package tsconfig sets `rootDir: src` and includes only
        // `src/**/*.ts`, so test files belong to no compiled project. The
        // package projects supply type information for sources; the lint-only,
        // noEmit tsconfig.eslint.json covers the tests. Listing both keeps
        // tests type-aware without widening any package's build output.
        project: ["./*/tsconfig.json", "./kernel/binding/tsconfig.json", "./tsconfig.eslint.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Rules that apply to every linted file, JS and TS alike. Only core ESLint
  // rules belong here; the TypeScript plugin is scoped to TypeScript files.
  {
    rules: {
      // Dead and duplicated code.
      "no-unreachable": "error",
      "no-duplicate-imports": "error",
      "no-dupe-else-if": "error",
      "no-constant-binary-expression": "error",
      "no-self-compare": "error",
      "no-unmodified-loop-condition": "error",

      // Accidental globals and sloppy scoping.
      "no-undef": "error",
      "no-implicit-globals": "error",
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],

      // Silently swallowed failures. An empty block is allowed only when a
      // comment explains why, which keeps deliberate no-ops reviewable.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "no-useless-catch": "error",
      "no-ex-assign": "error",
      "require-atomic-updates": "error",
    },
  },

  // TypeScript-only rules, including the type-aware promise checks.
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    rules: {
      // Unused bindings are the highest-yield real-defect signal here. The
      // underscore prefix is the deliberate, reviewable way to keep a required
      // positional parameter or an intentionally discarded destructured field.
      "no-unused-vars": "off", // superseded by the TypeScript-aware version
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],

      // Promise handling. These are the type-aware rules that catch a missing
      // await -- the defect class most likely to produce a silently passing
      // test and a broken release step.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",

      // Type-only imports are erased at compile time. Being consistent keeps
      // NodeNext ESM output free of imports that exist only for types.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],

      // The codebase is deliberately explicit about its own types; these
      // defaults would demand broad rewrites without finding real defects.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",

      // An `async` method implementing an async interface is correct even when
      // its current body never awaits -- the signature is the contract, and
      // dropping `async` to satisfy this rule would change the returned type.
      // The adapter and store implementations are full of exactly that shape.
      "@typescript-eslint/require-await": "off",

      // Reports the `as unknown as T` used to build partial test doubles and to
      // cross the deliberately-narrow store boundaries. Those assertions are
      // intentional, so this rule reports style, not defects.
      "@typescript-eslint/no-unnecessary-type-assertion": "off",

      // These fire on the untrusted-input validators at the Runtime and store
      // boundaries -- the code whose whole purpose is to receive an `any` and
      // narrow it with explicit typeof/Array.isArray/null checks before
      // anything else touches it. The reported "unsafe" accesses are the
      // validation reads themselves. Satisfying the rules would mean asserting
      // the input into a type before it has been checked, which is strictly
      // less safe than what the code does now.
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",

      // The core rule counts `import {...}` and `import type {...}` from the
      // same module as a duplicate. Separating the value and type imports is
      // this codebase's deliberate, consistent style -- and the style that
      // consistent-type-imports above enforces -- so the core rule is replaced
      // by the TypeScript-aware version, which understands the distinction.
      "no-duplicate-imports": "off",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
    },
  },

  // Plain JavaScript tooling (.mjs/.js/.cjs). The type-aware rule set is scoped
  // to TypeScript above, so only the syntactic rules apply here.
  {
    files: ["**/*.mjs", "**/*.js", "**/*.cjs"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        structuredClone: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        globalThis: "readonly",
      },
    },
    rules: {
      // The TypeScript-aware variant is unavailable here (that plugin is scoped
      // to TypeScript files), so the base rule carries the same policy.
      "no-unused-vars": [
        "error",
        {
          args: "after-used",
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // TypeScript resolves identifiers through the compiler, including ambient
  // declarations like the `NodeJS` namespace that exist only in the type space
  // and are invisible to `no-undef`. The compiler already reports genuinely
  // undefined identifiers as TS2304, so the lint rule is off here -- keeping it
  // on produces only false positives on type-space names.
  {
    files: ["**/*.ts", "**/*.mts", "**/*.cts"],
    rules: {
      "no-undef": "off",
    },
  },

  // Architecture backstop: these packages must own no process output. The
  // authoritative, path-precise check stays in tools/validate-boundaries.mjs;
  // this catches the same mistake earlier, in the editor.
  {
    files: ["installer/src/**/*.ts", "application/src/**/*.ts", "mcp-server/src/**/*.ts"],
    rules: {
      "no-console": "error",
    },
  },

  // Tests assert on rejected promises and deliberately malformed input, so the
  // strictest promise and unsafe-value rules would report the test technique
  // itself rather than a defect.
  {
    files: ["**/*.test.{ts,mts,mjs,js}", "**/test/**", "**/tests/**"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
);
