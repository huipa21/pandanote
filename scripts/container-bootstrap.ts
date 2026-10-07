import {
  initializeApplication,
  type InitializationOptions,
} from '../src/lib/server/initialize.ts';

/** After privilege drop, before listening. Dev/start use this same initializer. */
export async function bootstrapContainer(
  options: InitializationOptions = {},
): Promise<void> {
  await initializeApplication(options);
}
