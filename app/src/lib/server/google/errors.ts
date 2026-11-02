// What a failed Google request means for the Hub: try again later, sign in again, or give up on that one change.

/** Google has ended the Hub's sign-in, or it never signed in. */
export class SignInNeeded extends Error {
	constructor() {
		super('Google sign-in needed');
	}
}

/** Google answered, but turned the request down, for example because the item is gone. Trying again won't help. */
export class GoogleRefused extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

// Google sends some of its "slow down" answers as 403, not 429. They pass, so a change waiting to be sent must wait.
const SLOW_DOWN = new Set([
	'rateLimitExceeded',
	'userRateLimitExceeded',
	'quotaExceeded',
	'dailyLimitExceeded',
	'RATE_LIMIT_EXCEEDED'
]);
// The sign-in doesn't include what the request needs, which signing in again fixes.
const MISSING_PERMISSION = new Set(['insufficientPermissions', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT']);

interface GoogleErrorBody {
	error?: { status?: string; errors?: { reason?: string }[]; details?: { reason?: string }[] };
}

/** The error for a Google request that failed with `status`, from what Google said in `body`. */
export function googleError(status: number, body: unknown, message: string): Error {
	const error = (body as GoogleErrorBody | null)?.error;
	const reasons = [...(error?.errors ?? []), ...(error?.details ?? [])].map((e) => e.reason);
	const full = `${message}: ${status}`;
	if (status === 408 || status === 429 || status >= 500) return new Error(full);
	if (error?.status === 'RESOURCE_EXHAUSTED' || reasons.some((r) => r && SLOW_DOWN.has(r))) return new Error(full);
	if (reasons.some((r) => r && MISSING_PERMISSION.has(r))) return new SignInNeeded();
	return new GoogleRefused(status, full);
}
