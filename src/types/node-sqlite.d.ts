// Minimal ambient types for Node's built-in `node:sqlite` (stable in Node 24,
// still flagged experimental, so the bundled @types/node here doesn't declare
// it). Runtime uses the real module; this just satisfies tsc for the bits we use.
declare module "node:sqlite" {
  type SQLInputValue = string | number | bigint | null | Uint8Array;

  export class StatementSync {
    all(...params: SQLInputValue[]): unknown[];
    get(...params: SQLInputValue[]): unknown;
    run(...params: SQLInputValue[]): { changes: number; lastInsertRowid: number | bigint };
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
