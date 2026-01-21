import { SDMobileCore, CoreEvent } from "sd-mobile-core";
import type { Event } from "@sd/ts-client/src/generated/types";

export interface EventFilter {
	library_id?: string;
	job_id?: string;
	device_id?: string;
	resource_type?: string;
	path_scope?: any;
	include_descendants?: boolean;
}

export interface SubscriptionOptions {
	event_types?: string[];
	filter?: EventFilter;
}

export interface JsonRpcRequest {
	jsonrpc: "2.0";
	id: string;
	method: string;
	params: {
		input: unknown;
		library_id?: string;
	};
}

export interface JsonRpcErrorData {
	error_type: string;
	details?: Record<string, unknown>;
}

export interface JsonRpcResponse {
	jsonrpc: "2.0";
	id: string;
	result?: unknown;
	error?: { code: number; message: string; data?: JsonRpcErrorData };
}

/**
 * Custom error class for Spacedrive errors with additional context.
 */
export class SpacedriveError extends Error {
	public readonly code: number;
	public readonly errorType: string;
	public readonly details?: Record<string, unknown>;

	constructor(
		message: string,
		code: number,
		errorType: string,
		details?: Record<string, unknown>,
	) {
		super(message);
		this.name = "SpacedriveError";
		this.code = code;
		this.errorType = errorType;
		this.details = details;
	}

	/**
	 * Check if this is a specific error type.
	 */
	isType(errorType: string): boolean {
		return this.errorType === errorType;
	}
}

type PendingRequest = {
	resolve: (result: unknown) => void;
	reject: (error: Error) => void;
	timeoutId?: ReturnType<typeof setTimeout>;
};

let requestCounter = 0;

// Timeout configuration
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds for normal requests
const LONG_RUNNING_TIMEOUT_MS = 120000; // 2 minutes for long-running operations

// Methods that are known to take longer
const LONG_RUNNING_METHODS = [
	"action:locations.add",
	"action:locations.rescan",
	"action:libraries.create",
	"action:jobs.run",
];

/**
 * Check if a method is a long-running operation.
 */
function isLongRunningMethod(method: string): boolean {
	return LONG_RUNNING_METHODS.some((m) => method.startsWith(m));
}

/**
 * Transport layer for communicating with the embedded Spacedrive core.
 * Batches requests for efficiency and handles JSON-RPC protocol.
 */
export class ReactNativeTransport {
	private pendingRequests = new Map<string, PendingRequest>();
	private batch: JsonRpcRequest[] = [];
	private batchQueued = false;

	constructor() {
		// No event listener needed - responses come through sendMessage promise
	}

	private processResponse = (response: JsonRpcResponse) => {
		const pending = this.pendingRequests.get(response.id);
		if (!pending) {
			return;
		}

		if (response.error) {
			console.error("[Transport] ❌ Response error:", response.error);
			const errorData = response.error.data;
			const error = new SpacedriveError(
				response.error.message,
				response.error.code,
				errorData?.error_type ?? "UNKNOWN_ERROR",
				errorData?.details,
			);
			pending.reject(error);
		} else {
			pending.resolve(response.result);
		}

		this.pendingRequests.delete(response.id);
	};

	private queueBatch() {
		if (this.batchQueued) return;
		this.batchQueued = true;

		// Use setImmediate-like behavior for batching
		setTimeout(async () => {
			const currentBatch = [...this.batch];
			this.batch = [];
			this.batchQueued = false;

			if (currentBatch.length === 0) return;

			try {
				const query = JSON.stringify(
					currentBatch.length === 1 ? currentBatch[0] : currentBatch,
				);
				const resultStr = await SDMobileCore.sendMessage(query);
				const result = JSON.parse(resultStr);

				if (Array.isArray(result)) {
					result.forEach(this.processResponse);
				} else {
					this.processResponse(result);
				}
			} catch (e) {
				console.error("[Transport] ❌ Batch request failed:", e);
				for (const req of currentBatch) {
					const pending = this.pendingRequests.get(req.id);
					if (pending) {
						pending.reject(new Error("Batch request failed"));
						this.pendingRequests.delete(req.id);
					}
				}
			}
		}, 0);
	}

	/**
	 * Send a request to the core and return a promise with the result.
	 * @param method The JSON-RPC method to call
	 * @param params The parameters for the method
	 * @param options Optional configuration including custom timeout
	 */
	async request<T = unknown>(
		method: string,
		params: { input: unknown; library_id?: string },
		options?: { timeout?: number },
	): Promise<T> {
		return new Promise((resolve, reject) => {
			const id = `${++requestCounter}`;

			// Determine timeout based on method type or explicit option
			const timeout =
				options?.timeout ??
				(isLongRunningMethod(method) ? LONG_RUNNING_TIMEOUT_MS : DEFAULT_TIMEOUT_MS);

			// Set up timeout handler
			const timeoutId = setTimeout(() => {
				const pending = this.pendingRequests.get(id);
				if (pending) {
					this.pendingRequests.delete(id);
					console.error(`[Transport] ⏰ Request timeout after ${timeout}ms: ${method}`);
					reject(
						new SpacedriveError(
							`Request timeout after ${timeout}ms: ${method}`,
							-32000,
							"TIMEOUT",
							{ method, timeout },
						),
					);
				}
			}, timeout);

			this.pendingRequests.set(id, {
				resolve: (result: unknown) => {
					clearTimeout(timeoutId);
					resolve(result as T);
				},
				reject: (error: Error) => {
					clearTimeout(timeoutId);
					reject(error);
				},
				timeoutId,
			});

			this.batch.push({
				jsonrpc: "2.0",
				id,
				method,
				params,
			});

			this.queueBatch();
		});
	}

	/**
	 * Subscribe to events from the embedded core.
	 * Note: Mobile core doesn't support per-subscription filtering yet.
	 * All filtering happens client-side via SubscriptionManager.
	 */
	async subscribe(
		callback: (event: Event) => void,
		_options?: SubscriptionOptions,
	): Promise<() => void> {
		const unlisten = SDMobileCore.addListener((coreEvent: CoreEvent) => {
			try {
				const event = JSON.parse(coreEvent.body) as Event;
				callback(event);
			} catch (e) {
				console.error("[Transport] ❌ Failed to parse event:", e);
			}
		});

		return unlisten;
	}

	/**
	 * Clean up resources including pending timeouts.
	 */
	destroy() {
		// Clear all pending timeouts before clearing the map
		for (const pending of this.pendingRequests.values()) {
			if (pending.timeoutId) {
				clearTimeout(pending.timeoutId);
			}
		}
		this.pendingRequests.clear();
		this.batch = [];
	}
}
