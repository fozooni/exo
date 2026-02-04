/**
 * @fozooni/exo - Entry Point
 *
 * A strict, type-safe Exoskeleton for AI Agents.
 * Provides runtime validation, risk management, and automatic
 * schema generation for OpenAI and Anthropic integrations.
 *
 * @packageDocumentation
 *
 * @example
 * ```typescript
 * import { createExoTool, RiskLevel } from '@fozooni/exo';
 * import { z } from 'zod';
 *
 * const weatherTool = createExoTool({
 *   name: 'get_weather',
 *   description: 'Get the current weather for a city',
 *   schema: z.object({
 *     city: z.string().describe('The city name'),
 *   }),
 *   executor: async ({ city }) => {
 *     return { temperature: 22, conditions: 'sunny' };
 *   },
 *   config: { riskLevel: RiskLevel.LOW },
 * });
 *
 * // Use with OpenAI
 * const openAISpec = weatherTool.getOpenAISpec();
 *
 * // Use with Anthropic
 * const anthropicSpec = weatherTool.getAnthropicSpec();
 *
 * // Execute the tool
 * const result = await weatherTool.execute({ city: 'Istanbul' });
 * ```
 */

import type { ZodTypeAny } from "zod";

// ============================================================================
// Re-exports
// ============================================================================

// Core classes
export { ExoTool } from "./core/ExoTool.js";
export { Exo } from "./core/Exo.js";

// Types
export {
  RiskLevel,
  type ExoContext,
  type ExoToolConfig,
  type ExoExecutionResult,
  type ExoExecutor,
  type OpenAIToolSpec,
  type AnthropicToolSpec,
  type ValidationResult,
  type ExecutionOptions,
  type ExoHooks,
  type HookStartPayload,
  type HookSuccessPayload,
  type HookErrorPayload,
  type ExoMiddleware,
  type MiddlewareParams,
} from "./types/index.js";

// Errors
export {
  ExoError,
  ValidationError,
  ExecutionError,
  RiskViolationError,
  ConfirmationRequiredError,
} from "./errors/index.js";

// Adapters
export {
  toVercelTool,
  toLangChainTool,
  toVercelTools,
  toLangChainTools,
  type VercelToolSpec,
  type LangChainToolSpec,
} from "./adapters/index.js";

// Middleware
export {
  createRateLimiter,
  type RateLimiterOptions,
} from "./middleware/index.js";

// ============================================================================
// Factory Function
// ============================================================================

import { ExoTool } from "./core/ExoTool.js";
import type { ExoToolConfig, ExoExecutor } from "./types/index.js";

/**
 * Options for creating an ExoTool using the factory function.
 *
 * @typeParam TSchema - The Zod schema type for input validation.
 * @typeParam TOutput - The return type of the executor function.
 */
export interface CreateExoToolOptions<TSchema extends ZodTypeAny, TOutput> {
  /**
   * The unique name of the tool.
   * Should use snake_case for compatibility with AI providers.
   */
  name: string;

  /**
   * A description of what the tool does.
   * This is used by AI models to understand when to use the tool.
   */
  description: string;

  /**
   * The Zod schema for validating input arguments.
   * Use `.describe()` on fields to provide field-level documentation.
   */
  schema: TSchema;

  /**
   * The async function that executes the tool's operation.
   * Receives validated arguments and execution context.
   */
  executor: ExoExecutor<TSchema, TOutput>;

  /**
   * Optional configuration for risk level, confirmation, etc.
   */
  config?: ExoToolConfig;
}

/**
 * Factory function for creating ExoTool instances with better type inference.
 *
 * This function provides the same functionality as `new ExoTool()` but with
 * improved TypeScript type inference. The schema type is automatically
 * inferred, so you don't need to specify generic parameters.
 *
 * @typeParam TSchema - The Zod schema type (automatically inferred).
 * @typeParam TOutput - The executor return type (automatically inferred).
 *
 * @param options - The tool configuration options.
 * @returns A new ExoTool instance.
 *
 * @example
 * ```typescript
 * import { createExoTool } from '@fozooni/exo';
 * import { z } from 'zod';
 *
 * // Type inference works automatically - no need to specify generics
 * const searchTool = createExoTool({
 *   name: 'search_database',
 *   description: 'Search the database for records',
 *   schema: z.object({
 *     query: z.string().min(1).describe('The search query'),
 *     limit: z.number().optional().default(10),
 *   }),
 *   executor: async ({ query, limit }) => {
 *     // `query` is typed as string, `limit` as number
 *     return { results: [], total: 0 };
 *   },
 * });
 *
 * // The executor return type is inferred
 * const result = await searchTool.execute({ query: 'test' });
 * // result.data is typed as { results: never[], total: number }
 * ```
 */
export function createExoTool<TSchema extends ZodTypeAny, TOutput>(
  options: CreateExoToolOptions<TSchema, TOutput>,
): ExoTool<TSchema, TOutput> {
  return new ExoTool<TSchema, TOutput>(options);
}

// ============================================================================
// Observability Helpers
// ============================================================================

import type { ExoHooks } from "./types/index.js";

/**
 * Creates a simple console logger that implements ExoHooks.
 *
 * Provides instant debugging without any external dependencies.
 * Colorful output shows tool lifecycle events with timing information.
 *
 * @param options - Optional configuration.
 * @param options.prefix - Prefix for log messages (default: '[EXO]').
 *
 * @example
 * ```typescript
 * const exo = createExoTool({
 *   name: 'my_tool',
 *   schema: z.object({}),
 *   executor: async () => ({ ok: true }),
 *   config: {
 *     hooks: createConsoleLogger(),
 *   },
 * });
 * ```
 */
export function createConsoleLogger(
  options: { prefix?: string } = {},
): ExoHooks {
  const prefix = options.prefix ?? "[EXO]";

  return {
    onStart: ({ toolName, args }) => {
      console.log(`${prefix} ▶ START ${toolName}`, args);
    },
    onSuccess: ({ toolName, duration }) => {
      console.log(`${prefix} ✓ SUCCESS ${toolName} (${duration.toFixed(2)}ms)`);
    },
    onError: ({ toolName, error, duration }) => {
      console.error(
        `${prefix} ✗ ERROR ${toolName} (${duration.toFixed(2)}ms):`,
        error.message,
      );
    },
  };
}
