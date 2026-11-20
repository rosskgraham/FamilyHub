import { version } from '$app/env';

// What's running, for Settings: a release the Pi installed (ADR 0004), or a build on the PC.

export const build = {
	/** The release's name, such as 2026.11.20.73. A development build's is the time it was built. */
	version,
	/** Whether this is a release built by CI, rather than a build on the PC. */
	release: __HUB_RELEASE__,
	/** The short commit it was built from, or empty if that wasn't known. */
	commit: __HUB_COMMIT__,
	/** When it was built, as an ISO time. */
	builtAt: __HUB_BUILT_AT__
};
