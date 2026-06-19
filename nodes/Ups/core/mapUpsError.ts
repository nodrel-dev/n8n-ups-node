import { NodeApiError } from 'n8n-workflow';
import type { INode, JsonObject } from 'n8n-workflow';

// Shared error mapper for every declarative operation (ADR-0004). n8n's declarative layer
// auto-throws a generic NodeApiError on non-2xx and `postReceive` runs only on success, burying
// the UPS code/message. Operations set `ignoreHttpStatusErrors: true` and route every response
// through here so UPS's `code`/`message` are surfaced verbatim (SC-005) and classified.
//
// Parses BOTH envelope shapes: the common `response.errors[]` (Rating/Shipping/Validate,
// CommonErrorResponse) AND Track's distinct chain (Response → response → ErrorResponse → errors[]),
// which collapses to the same `response.errors[]` JSON. Defensive against top-level `errors[]` too.
// Boundary failures (missing account/customs) use NodeOperationError instead — never this.

interface UpsError {
	code?: string;
	message?: string;
}

function extractErrors(responseData: unknown): UpsError[] {
	if (responseData === null || typeof responseData !== 'object') return [];
	const data = responseData as Record<string, unknown>;

	// Common + Track: { response: { errors: [...] } }
	const response = data.response as Record<string, unknown> | undefined;
	if (response && Array.isArray(response.errors)) {
		return response.errors as UpsError[];
	}

	// Track's capitalized wrapper variant: { Response: { response: { errors: [...] } } }
	const capitalized = data.Response as Record<string, unknown> | undefined;
	const nested = capitalized?.response as Record<string, unknown> | undefined;
	if (nested && Array.isArray(nested.errors)) {
		return nested.errors as UpsError[];
	}

	// Defensive: top-level { errors: [...] }
	if (Array.isArray(data.errors)) {
		return data.errors as UpsError[];
	}

	return [];
}

type ErrorClass = 'auth' | 'input' | 'transient';

function classify(statusCode: number): ErrorClass {
	if (statusCode === 401 || statusCode === 403) return 'auth';
	if (statusCode === 429 || statusCode >= 500) return 'transient';
	return 'input';
}

const CLASS_PREFIX: Record<ErrorClass, string> = {
	// Lowercased keywords here are asserted by the tests and read by users in the UI.
	auth: 'UPS authentication failed',
	input: 'UPS rejected the request (invalid input)',
	transient: 'UPS is temporarily unavailable — try again',
};

export function mapUpsError(node: INode, responseData: unknown, statusCode: number): never {
	const errors = extractErrors(responseData);
	const cls = classify(statusCode);
	const prefix = CLASS_PREFIX[cls];

	// Surface UPS code/message verbatim (SC-005). Join multiple errors; fall back when none parse.
	const detail =
		errors.length > 0
			? errors
					.map((e) => `${e.code ?? 'UNKNOWN'}: ${e.message ?? 'No message provided by UPS'}`)
					.join('; ')
			: 'No structured error was returned by UPS.';

	const message = `${prefix} — ${detail}`;

	throw new NodeApiError(node, (responseData ?? {}) as JsonObject, {
		message,
		description: detail,
		httpCode: String(statusCode),
		level: cls === 'transient' ? 'warning' : 'error',
	});
}
