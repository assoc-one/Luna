/**
 * Fail-loud environment access (convention-secrets).
 *
 * Two properties matter here, and they pull in opposite directions:
 *
 * 1. **A missing variable throws, naming itself.** Silently falling back to a
 *    default or an empty string turns a configuration error into a confusing
 *    runtime one somewhere far away. The error names the variable so the fix
 *    is obvious from the message alone.
 *
 * 2. **Nothing is read at module scope.** Every accessor below is a function,
 *    evaluated when it is *called* rather than when the module is imported.
 *    That is what lets `next build` succeed with no credentials present —
 *    which is the whole point of the APP-59 / APP-1034 split. Reading
 *    `process.env` at the top level would reintroduce the build-time
 *    dependency on secrets that the split exists to remove.
 *
 * If you add a variable, add it to `.env.example` too (name only, never a
 * value) and give it an accessor here rather than reaching into `process.env`
 * directly at the call site.
 */

/**
 * Read a required environment variable, or throw naming it.
 *
 * An empty string is treated as missing: `.env.example` ships every name with
 * an empty value, so a half-configured environment presents as `""` rather
 * than `undefined`, and that must fail exactly as loudly.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];

  if (value === undefined || value === "") {
    throw new Error(
      `Missing environment variable: ${name}. ` +
        `Add it to .env.local for local work, or to the Vercel project's ` +
        `environment settings for a deployment. See .env.example for the full list.`,
    );
  }

  return value;
}

/** Anthropic API key — the Claude conversation and plan-generation endpoints. */
export const anthropicApiKey = (): string => requireEnv("ANTHROPIC_API_KEY");

/** ElevenLabs API key — Luna's streamed voice. */
export const elevenLabsApiKey = (): string => requireEnv("ELEVENLABS_API_KEY");

/** Vercel KV connection details — the anonymous session and state layer. */
export const kvConfig = (): {
  url: string;
  token: string;
  readOnlyToken: string;
} => ({
  url: requireEnv("KV_REST_API_URL"),
  token: requireEnv("KV_REST_API_TOKEN"),
  readOnlyToken: requireEnv("KV_REST_API_READ_ONLY_TOKEN"),
});
