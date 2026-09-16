/**
 * dsh-whale-buddy — host half.
 *
 * The plugin is browser-only cosmetics. The host half exists so the package
 * mounts as a cordis loader entry, which is what makes DSH's client-module
 * scan find `exports["./client"]` and put the browser bundle in the web
 * manifest. It owns no host state and registers no tools.
 *
 * Portions adapted from:
 * https://github.com/dsh-plugins/dsh-thought-buddy (src/index.ts)
 * BSD-3-Clause. See THIRD_PARTY_NOTICES.md.
 */

/** The slice of a cordis Context this plugin touches. */
export interface WhaleBuddyContext {
  logger?: {
    debug?: (...args: unknown[]) => void
  }
}

/** Plugin name as it appears in cordis diagnostics. */
export const name = 'whale-buddy'

/**
 * Host-side activation.
 * @param ctx - cordis context supplied by the loader.
 */
export function apply(ctx: WhaleBuddyContext): void {
  ctx.logger?.debug?.('[dsh-whale-buddy] host half loaded (browser-only surfaces)')
}
