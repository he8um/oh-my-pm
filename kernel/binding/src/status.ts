// Internal binding-mode markers shared by the boundary implementations.
// They live outside index.ts so node.ts can mark its APIs without a
// circular runtime import.

export const UNAVAILABLE_REASON: unique symbol = Symbol("kernel-binding-unavailable");
export const WASM_MODE: unique symbol = Symbol("kernel-binding-wasm");

export type BindingMarkers = {
  [UNAVAILABLE_REASON]?: string;
  [WASM_MODE]?: true;
};
