/**
 * Build metadata exposed by the public health endpoint.
 *
 * `script/build.ts` replaces these environment reads with the source commit and
 * package version when it creates the production bundle. Development server runs
 * honestly report `dev` instead of pretending to identify a deployment.
 */
export const BUILD_COMMIT = process.env.BUILD_COMMIT?.trim() || "dev";
export const BUILD_VERSION = process.env.BUILD_VERSION?.trim() || "dev";