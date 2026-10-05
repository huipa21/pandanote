import type { Appearance } from './lib/shared/appearance.ts';
import type { Runtime } from './lib/server/runtime.ts';
import type { SessionIdentity } from './lib/server/auth/service.ts';

declare global {
  namespace App {
    interface PageState {
      detailId?: string;
      detailImage?: string;
    }
    interface Locals {
      runtime?: Runtime;
      identity: SessionIdentity | null;
      clientIp?: string;
      appearance?: Appearance;
    }
  }
}
export {};
