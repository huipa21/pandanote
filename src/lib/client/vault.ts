export const VAULT = Symbol('vault');
export interface VaultControls {
  readonly open: boolean;
  readonly busy: boolean;
  activate(): void;
}
