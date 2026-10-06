import { buildInfoFromEnvironment } from '../src/lib/shared/build-info.ts';

// Production Docker builds must not silently ship a Development identity.
buildInfoFromEnvironment(process.env, true);
