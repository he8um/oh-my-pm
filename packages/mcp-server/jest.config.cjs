/** @type {import("jest").Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  transform: {
    "^.+\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.jest.json" }],
  },
  moduleNameMapper: {
    "^(\\.{1,2}/[^.]+)\\.js$": "$1",
    "^(\\.{1,2}/.+/[^.]+)\\.js$": "$1",
  },
  moduleFileExtensions: ["ts", "js", "json", "cjs"],
};
