/**
 * @fozooni/exo - Type Definitions
 *
 * Core type definitions for the Exo AI Agent Toolkit.
 * These types provide the foundation for type-safe tool creation and execution.
 *
 * @packageDocumentation
 */

import type { z } from "zod";

// ============================================================================
// Risk Level Enumeration
// ============================================================================

/**
 * Defines the risk level of an ExoTool operation.
 *
 * Risk levels help agents and orchestration systems determine:
 * - Whether user confirmation is required
 * - Logging and audit requirements
 * - Rate limiting and throttling policies
 *
 * @example
 * ```typescript
 * const config: ExoToolConfig = {
 *   riskLevel: RiskLevel.HIGH,
 *   requiresConfirmation: true,
 * };
 * ```
 */
export const RiskLevel = {
  /**
   * Low-risk operations that are safe to execute automatically.
   * Examples: Read-only queries, data retrieval, simple calculations.
   */
  LOW: "LOW",

  /**
   * Medium-risk operations that may modify state but are reversible.
   * Examples: Creating draft content, updating user preferences.
   */
  MEDIUM: "MEDIUM",

  /**
   * High-risk operations that can have significant or irreversible effects.
   * Examples: Deleting data, sending emails, making financial transactions.
   */
  HIGH: "HIGH",
} as const;

/**
 * Type representing valid risk level values.
 */
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

// ============================================================================
// Execution Context
// ============================================================================

/**
 * Context object passed to the executor function during tool execution.
 *
 * The context provides information about the current execution environment,
 * including user identity, permissions, and custom metadata. This enables
 * tools to implement authorization checks and audit logging.
 *
 * @example
 * ```typescript
 * const context: ExoContext = {
 *   user: { id: 'user_123', role: 'admin' },
 *   scope: ['read', 'write', 'delete'],
 *   sessionId: 'sess_abc',
 *   metadata: {
 *     source: 'chat_interface',
 *     requestId: 'req_xyz',
 *   },
 * };
 * ```
 */
export interface ExoContext {
  /**
   * User information for the current execution.
   * Contains identity and role for permission checks.
   */
  user?: {
    /** Unique identifier for the user. */
    id: string;
    /** User's role for permission-based access control. */
    role: string;
  };

  /**
   * Permission scopes granted to the current execution.
   * Used for fine-grained access control.
   */
  scope?: string[];

  /**
   * Unique identifier for the user initiating the tool execution.
   * @deprecated Use `user.id` instead.
   */
  userId?: string;

  /**
   * Flag indicating whether the user has administrative privileges.
   * @deprecated Use `user.role === 'admin'` instead.
   */
  isAdmin?: boolean;

  /**
   * Session identifier for tracking related executions.
   */
  sessionId?: string;

  /**
   * Custom metadata that can be passed to the executor.
   * Use this for domain-specific context that doesn't fit other fields.
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Execution Options
// ============================================================================

/**
 * Options for controlling tool execution behavior.
 *
 * These options allow bypassing safety checks when appropriate,
 * such as when an admin needs to force execution or when the user
 * has already confirmed a dangerous operation.
 *
 * @example
 * ```typescript
 * // Normal execution
 * await tool.execute(args, context);
 *
 * // Admin override for high-risk operation
 * await tool.execute(args, context, { sudo: true });
 *
 * // User-confirmed operation
 * await tool.execute(args, context, { confirmed: true });
 * ```
 */
export interface ExecutionOptions {
  /**
   * When true, bypasses the admin role check for HIGH risk tools.
   * Use with caution - this is intended for system-level operations.
   *
   * @default false
   */
  sudo?: boolean;

  /**
   * When true, indicates the user has explicitly confirmed the operation.
   * Required for tools with `requiresConfirmation: true`.
   *
   * @default false
   */
  confirmed?: boolean;
}

// ============================================================================
// Lifecycle Hooks
// ============================================================================

/**
 * Payload for the onStart hook.
 */
export interface HookStartPayload {
  toolName: string;
  args: unknown;
  context: ExoContext;
}

/**
 * Payload for the onSuccess hook.
 */
export interface HookSuccessPayload {
  toolName: string;
  result: unknown;
  duration: number;
  context: ExoContext;
}

/**
 * Payload for the onError hook.
 */
export interface HookErrorPayload {
  toolName: string;
  error: Error;
  duration: number;
  context: ExoContext;
}

/**
 * Lifecycle hooks for observability and instrumentation.
 *
 * These hooks fire regardless of how the tool is executed—directly,
 * via the Exo registry, or through framework adapters (Vercel, LangChain).
 *
 * All hooks are optional and should be resilient (hook errors won't crash execution).
 *
 * @example
 * ```typescript
 * const hooks: ExoHooks = {
 *   onStart: ({ toolName, args }) => {
 *     console.log(`[START] ${toolName}`, args);
 *   },
 *   onSuccess: ({ toolName, duration }) => {
 *     console.log(`[SUCCESS] ${toolName} in ${duration}ms`);
 *   },
 *   onError: ({ toolName, error, duration }) => {
 *     console.error(`[ERROR] ${toolName} failed after ${duration}ms`, error);
 *   },
 * };
 * ```
 */
export interface ExoHooks {
  /**
   * Called when a tool execution starts, before validation.
   */
  onStart?: (payload: HookStartPayload) => void | Promise<void>;

  /**
   * Called when a tool execution completes successfully.
   */
  onSuccess?: (payload: HookSuccessPayload) => void | Promise<void>;

  /**
   * Called when a tool execution fails with an error.
   */
  onError?: (payload: HookErrorPayload) => void | Promise<void>;
}

// ============================================================================
// Tool Configuration
// ============================================================================

/**
 * Configuration options for an ExoTool instance.
 *
 * These settings control the behavior of the tool during execution,
 * including risk assessment, confirmation requirements, and timeout handling.
 *
 * @example
 * ```typescript
 * const config: ExoToolConfig = {
 *   riskLevel: RiskLevel.HIGH,
 *   requiresConfirmation: true,
 *   timeout: 30000, // 30 seconds
 *   retryable: false,
 * };
 * ```
 */
export interface ExoToolConfig {
  /**
   * The risk level associated with this tool.
   * Used to determine confirmation requirements and logging policies.
   *
   * @default RiskLevel.LOW
   */
  riskLevel?: RiskLevel;

  /**
   * Whether the tool requires explicit user confirmation before execution.
   * When true, the orchestration system should prompt for confirmation.
   *
   * @default false
   */
  requiresConfirmation?: boolean;

  /**
   * Maximum execution time in milliseconds before the operation times out.
   * Set to 0 or undefined for no timeout.
   *
   * @default undefined (no timeout)
   */
  timeout?: number;

  /**
   * Whether failed executions can be retried.
   * Useful for transient failures like network issues.
   *
   * @default true
   */
  retryable?: boolean;

  /**
   * Maximum number of retry attempts for retryable operations.
   *
   * @default 3
   */
  maxRetries?: number;

  /**
   * Tags for categorizing and filtering tools.
   * Examples: ['database', 'read-only'], ['external-api', 'payments']
   */
  tags?: string[];

  /**
   * Lifecycle hooks for observability.
   * These fire on every execution regardless of how the tool is invoked.
   */
  hooks?: ExoHooks;

  /**
   * Middleware functions to wrap the execution pipeline.
   * Middleware runs before/after the tool's core logic and can be used for
   * logging, rate limiting, transformation, etc.
   *
   * @example
   * ```typescript
   * const loggingMiddleware: ExoMiddleware = async (params) => {
   *   console.log('Before');
   *   const result = await params.next();
   *   console.log('After');
   *   return result;
   * };
   * ```
   */
  middleware?: ExoMiddleware[];
}

// ============================================================================
// Middleware System
// ============================================================================

/**
 * Parameters for middleware functions.
 */
export interface MiddlewareParams {
  /**
   * The name of the tool being executed.
   */
  toolName: string;

  /**
   * The raw arguments passed to the tool.
   * Middleware can modify these arguments before changing execution,
   * but should be careful not to break schema validation.
   */
  args: unknown;

  /**
   * The execution context.
   */
  context: ExoContext;

  /**
   * The next function in the pipeline.
   * Calling this executes the next middleware or the core tool logic.
   *
   * @returns A promise resolving to the execution result.
   */
  next: () => Promise<ExoExecutionResult<unknown>>;
}

/**
 * Middleware function type.
 *
 * Middleware wraps the execution of a tool and can intercept args, context,
 * and results, or block execution entirely.
 */
export type ExoMiddleware = (
  params: MiddlewareParams,
) => Promise<ExoExecutionResult<unknown>>;

// ============================================================================
// Execution Result
// ============================================================================

/**
 * Standardized result format for ExoTool executions.
 *
 * This interface ensures consistent return values across all tools,
 * making it easier to handle results in orchestration systems.
 *
 * @typeParam T - The type of the data payload on successful execution.
 *
 * @example
 * ```typescript
 * // Successful execution
 * const success: ExoExecutionResult<WeatherData> = {
 *   success: true,
 *   data: { temperature: 22, conditions: 'sunny' },
 *   metadata: { cached: false, latency: 150 },
 * };
 *
 * // Failed execution
 * const failure: ExoExecutionResult<WeatherData> = {
 *   success: false,
 *   error: 'API rate limit exceeded',
 *   metadata: { retryAfter: 60 },
 * };
 * ```
 */
export interface ExoExecutionResult<T = unknown> {
  /**
   * Indicates whether the tool execution was successful.
   */
  success: boolean;

  /**
   * The result data from a successful execution.
   * Only present when `success` is true.
   */
  data?: T;

  /**
   * Error message describing what went wrong.
   * Only present when `success` is false.
   */
  error?: string;

  /**
   * Additional metadata about the execution.
   * Can include timing information, cache status, or other diagnostics.
   */
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Tool Definition Types
// ============================================================================

/**
 * Type definition for the executor function of an ExoTool.
 *
 * The executor receives validated arguments and context, and returns
 * the result of the tool operation.
 *
 * @typeParam TSchema - The Zod schema type for input validation.
 * @typeParam TOutput - The return type of the executor function.
 */
export type ExoExecutor<TSchema extends z.ZodTypeAny, TOutput> = (
  args: z.infer<TSchema>,
  context: ExoContext,
) => Promise<TOutput> | TOutput;

// ============================================================================
// OpenAI and Anthropic Specification Types
// ============================================================================

/**
 * OpenAI Function Calling specification format.
 *
 * This matches the structure expected by OpenAI's `tools` parameter
 * in chat completion requests.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 */
export interface OpenAIToolSpec {
  /**
   * The type of tool. Currently only 'function' is supported.
   */
  type: "function";

  /**
   * The function definition.
   */
  function: {
    /**
     * The name of the function to be called.
     */
    name: string;

    /**
     * A description of what the function does.
     */
    description: string;

    /**
     * The parameters the function accepts, as a JSON Schema object.
     */
    parameters: Record<string, unknown>;

    /**
     * Whether to enable strict schema validation (OpenAI feature).
     */
    strict?: boolean;
  };
}

/**
 * Anthropic Tool specification format.
 *
 * This matches the structure expected by Claude's `tools` parameter
 * in message requests.
 *
 * @see https://docs.anthropic.com/claude/docs/tool-use
 */
export interface AnthropicToolSpec {
  /**
   * The name of the tool.
   */
  name: string;

  /**
   * A description of what the tool does.
   */
  description: string;

  /**
   * The input schema for the tool, as a JSON Schema object.
   */
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Result of a validation operation.
 *
 * @typeParam T - The type of the validated data.
 */
export interface ValidationResult<T> {
  /**
   * Whether the validation was successful.
   */
  success: boolean;

  /**
   * The validated and parsed data (if successful).
   */
  data?: T;

  /**
   * Array of validation error messages (if failed).
   */
  errors?: string[];
}
