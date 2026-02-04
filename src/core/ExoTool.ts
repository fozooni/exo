/**
 * @fozooni/exo - ExoTool Core Class
 *
 * The main class for creating type-safe, validated AI agent tools.
 * Provides runtime validation, risk management, and automatic schema
 * generation for OpenAI and Anthropic integrations.
 *
 * @packageDocumentation
 */

import type { z, ZodTypeAny } from "zod";
import { zodToJsonSchema, type JsonSchema7Type } from "zod-to-json-schema";
import type {
  ExoContext,
  ExoToolConfig,
  ExoExecutionResult,
  ExoExecutor,
  OpenAIToolSpec,
  AnthropicToolSpec,
  ValidationResult,
  RiskLevel,
  ExecutionOptions,
  ExoHooks,
  ExoMiddleware,
} from "../types/index.js";
import {
  ValidationError,
  ExecutionError,
  RiskViolationError,
  ConfirmationRequiredError,
} from "../errors/index.js";

// ============================================================================
// Internal Types
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PipelineFn = (
  args?: unknown,
  context?: ExoContext,
) => Promise<ExoExecutionResult<any>>;

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default configuration values for ExoTool instances.
 */
const DEFAULT_CONFIG = {
  riskLevel: "LOW" as RiskLevel,
  requiresConfirmation: false,
  timeout: 0,
  retryable: true,
  maxRetries: 3,
  tags: [] as string[],
  middleware: [] as ExoMiddleware[],
};

// ============================================================================
// ExoTool Class
// ============================================================================

/**
 * A type-safe wrapper for AI agent tool functions.
 *
 * ExoTool provides:
 * - Runtime validation using Zod schemas
 * - Automatic type inference for executor functions
 * - OpenAI and Anthropic specification generation
 * - Risk management and execution configuration
 * - Standardized execution results
 *
 * @typeParam TSchema - The Zod schema type for input validation.
 * @typeParam TOutput - The return type of the executor function.
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 * import { ExoTool, RiskLevel } from '@fozooni/exo';
 *
 * const weatherSchema = z.object({
 *   city: z.string().min(1).describe('The city to get weather for'),
 *   units: z.enum(['celsius', 'fahrenheit']).optional().default('celsius'),
 * });
 *
 * const weatherTool = new ExoTool({
 *   name: 'get_weather',
 *   description: 'Retrieves the current weather for a specified city.',
 *   schema: weatherSchema,
 *   executor: async (args) => {
 *     // Fetch weather data...
 *     return { temperature: 22, conditions: 'sunny' };
 *   },
 *   config: {
 *     riskLevel: RiskLevel.LOW,
 *   },
 * });
 * ```
 */
export class ExoTool<TSchema extends ZodTypeAny, TOutput = unknown> {
  /**
   * The unique name of the tool.
   * Used as the function name in OpenAI/Anthropic specifications.
   */
  public readonly name: string;

  /**
   * A description of what the tool does.
   * Used in AI model prompts to help the model understand when to use this tool.
   */
  public readonly description: string;

  /**
   * The Zod schema for validating input arguments.
   */
  public readonly schema: TSchema;

  /**
   * The executor function that performs the tool's operation.
   */
  private readonly executor: ExoExecutor<TSchema, TOutput>;

  /**
   * Configuration options for the tool.
   */
  public readonly config: Required<Omit<ExoToolConfig, "hooks">> & {
    hooks?: ExoHooks;
    middleware: ExoMiddleware[];
  };

  /**
   * Cached JSON Schema representation of the Zod schema.
   */
  private cachedJsonSchema: JsonSchema7Type | null = null;

  /**
   * Creates a new ExoTool instance.
   *
   * @param options - The tool configuration options.
   * @param options.name - The unique name of the tool.
   * @param options.description - A description of what the tool does.
   * @param options.schema - The Zod schema for input validation.
   * @param options.executor - The async function that executes the tool.
   * @param options.config - Optional configuration overrides.
   *
   * @throws {Error} If name or description is empty.
   */
  constructor(options: {
    name: string;
    description: string;
    schema: TSchema;
    executor: ExoExecutor<TSchema, TOutput>;
    config?: ExoToolConfig;
  }) {
    const { name, description, schema, executor, config } = options;

    // Validate required fields
    if (!name || name.trim().length === 0) {
      throw new Error("Tool name is required and cannot be empty");
    }

    if (!description || description.trim().length === 0) {
      throw new Error("Tool description is required and cannot be empty");
    }

    this.name = name.trim();
    this.description = description.trim();
    this.schema = schema;
    this.executor = executor;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ==========================================================================
  // Validation Methods
  // ==========================================================================

  /**
   * Validates arguments against the tool's Zod schema.
   *
   * Use this method to validate input independently of execution,
   * for example in preview or confirmation workflows.
   *
   * @param args - The arguments to validate.
   * @returns A ValidationResult indicating success or failure.
   *
   * @example
   * ```typescript
   * const result = weatherTool.validate({ city: 'Istanbul' });
   * if (result.success) {
   *   console.log('Valid:', result.data);
   * } else {
   *   console.log('Errors:', result.errors);
   * }
   * ```
   */
  validate(args: unknown): ValidationResult<z.infer<TSchema>> {
    const parseResult = this.schema.safeParse(args);

    if (parseResult.success) {
      return {
        success: true,
        data: parseResult.data as z.infer<TSchema>,
      };
    }

    const errors = parseResult.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    });

    return {
      success: false,
      errors,
    };
  }

  // ==========================================================================
  // Schema Generation Methods
  // ==========================================================================

  /**
   * Gets the JSON Schema representation of the Zod schema.
   *
   * The result is cached for performance.
   *
   * @returns The JSON Schema object.
   */
  private getJsonSchema(): JsonSchema7Type {
    if (this.cachedJsonSchema === null) {
      this.cachedJsonSchema = zodToJsonSchema(this.schema, {
        name: this.name,
        $refStrategy: "none", // Inline all definitions for compatibility
      });
    }

    return this.cachedJsonSchema;
  }

  /**
   * Generates an OpenAI-compatible tool specification.
   *
   * The returned object can be directly used in OpenAI's
   * chat completion API `tools` parameter.
   *
   * @param options - Optional configuration for the spec generation.
   * @param options.strict - When true, generates schema compatible with OpenAI Structured Outputs.
   * @returns The OpenAI tool specification.
   *
   * @see https://platform.openai.com/docs/guides/function-calling
   *
   * @example
   * ```typescript
   * // Standard mode
   * const spec = weatherTool.getOpenAISpec();
   *
   * // Strict mode for Structured Outputs
   * const strictSpec = weatherTool.getOpenAISpec({ strict: true });
   * ```
   */
  getOpenAISpec(options: { strict?: boolean } = {}): OpenAIToolSpec {
    const { strict = false } = options;
    const jsonSchema = this.getJsonSchema() as Record<string, unknown>;

    // Extract the definition if wrapped, otherwise use as-is
    let parameters: Record<string, unknown>;

    if (
      jsonSchema["definitions"] &&
      typeof jsonSchema["definitions"] === "object"
    ) {
      // When using named schema, zod-to-json-schema wraps in definitions
      const definitions = jsonSchema["definitions"] as Record<string, unknown>;
      parameters = (definitions[this.name] as Record<string, unknown>) ?? {};
    } else if (jsonSchema["$ref"]) {
      // Handle $ref case - extract from definitions
      const definitions = jsonSchema["definitions"] as Record<string, unknown>;
      parameters = (definitions[this.name] as Record<string, unknown>) ?? {};
    } else {
      // Direct schema object
      parameters = { ...jsonSchema };
    }

    // Remove $schema if present (not needed for OpenAI)
    const { $schema, ...cleanParameters } = parameters as {
      $schema?: string;
    } & Record<string, unknown>;

    // Apply strict mode transformations
    let finalParameters = cleanParameters;
    if (strict) {
      finalParameters = this.applyStrictModeTransformations(cleanParameters);
    }

    return {
      type: "function",
      function: {
        name: this.name,
        description: this.description,
        parameters: finalParameters,
        ...(strict ? { strict: true } : {}),
      },
    };
  }

  /**
   * Applies strict mode transformations to a JSON schema for OpenAI Structured Outputs.
   *
   * - Sets `additionalProperties: false` on all object types
   * - Ensures all properties are marked as required
   *
   * @param schema - The JSON schema to transform.
   * @returns The transformed schema.
   */
  private applyStrictModeTransformations(
    schema: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...schema };

    // Add additionalProperties: false for object types
    if (result.type === "object") {
      result.additionalProperties = false;

      // Make all properties required if they aren't already
      if (result.properties && typeof result.properties === "object") {
        const propertyNames = Object.keys(
          result.properties as Record<string, unknown>,
        );
        result.required = propertyNames;

        // Recursively apply to nested objects
        const transformedProperties: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(
          result.properties as Record<string, unknown>,
        )) {
          if (typeof value === "object" && value !== null) {
            transformedProperties[key] = this.applyStrictModeTransformations(
              value as Record<string, unknown>,
            );
          } else {
            transformedProperties[key] = value;
          }
        }
        result.properties = transformedProperties;
      }
    }

    // Handle arrays with object items
    if (result.type === "array" && result.items) {
      if (typeof result.items === "object" && result.items !== null) {
        result.items = this.applyStrictModeTransformations(
          result.items as Record<string, unknown>,
        );
      }
    }

    return result;
  }

  /**
   * Generates an Anthropic-compatible tool specification.
   *
   * The returned object can be directly used in Anthropic's
   * message API `tools` parameter.
   *
   * @returns The Anthropic tool specification.
   *
   * @see https://docs.anthropic.com/claude/docs/tool-use
   *
   * @example
   * ```typescript
   * const spec = weatherTool.getAnthropicSpec();
   * // Use with Anthropic client:
   * // anthropic.messages.create({ tools: [spec] })
   * ```
   */
  getAnthropicSpec(): AnthropicToolSpec {
    const jsonSchema = this.getJsonSchema() as Record<string, unknown>;

    // Extract the definition if wrapped
    let schemaObject: Record<string, unknown>;

    if (
      jsonSchema["definitions"] &&
      typeof jsonSchema["definitions"] === "object"
    ) {
      const definitions = jsonSchema["definitions"] as Record<string, unknown>;
      schemaObject = (definitions[this.name] as Record<string, unknown>) ?? {};
    } else if (jsonSchema["$ref"]) {
      const definitions = jsonSchema["definitions"] as Record<string, unknown>;
      schemaObject = (definitions[this.name] as Record<string, unknown>) ?? {};
    } else {
      schemaObject = { ...jsonSchema };
    }

    // Remove $schema if present
    const { $schema, ...cleanSchema } = schemaObject as {
      $schema?: string;
    } & Record<string, unknown>;

    // Anthropic expects a specific structure
    const requiredFields = cleanSchema["required"] as string[] | undefined;
    const inputSchema: AnthropicToolSpec["input_schema"] = {
      type: "object",
      properties: (cleanSchema["properties"] as Record<string, unknown>) ?? {},
    };

    // Only include required if there are required fields (exactOptionalPropertyTypes compliance)
    if (requiredFields !== undefined && requiredFields.length > 0) {
      inputSchema.required = requiredFields;
    }

    return {
      name: this.name,
      description: this.description,
      input_schema: inputSchema,
    };
  }

  // ==========================================================================
  // Execution Methods
  // ==========================================================================

  /**
   * Executes the tool with the provided arguments and context.
   *
   * This method:
   * 1. Validates the arguments against the Zod schema
   * 2. Throws a ValidationError if validation fails
   * 3. Executes the tool's executor function
   * 4. Returns a standardized ExoExecutionResult
   *
   * @param args - The arguments to pass to the executor.
   * @param context - The execution context (user info, session, etc.).
   * @returns A promise resolving to the execution result.
   *
   * @throws {ValidationError} If the arguments fail validation.
   * @throws {RiskViolationError} If a high-risk tool is called without admin privileges.
   * @throws {ConfirmationRequiredError} If the tool requires confirmation and none was provided.
   *
   * @example
   * ```typescript
   * // Basic execution
   * const result = await weatherTool.execute(
   *   { city: 'Istanbul' },
   *   { user: { id: 'user_123', role: 'user' } }
   * );
   *
   * // High-risk tool with admin
   * const result = await nukeTool.execute(
   *   {},
   *   { user: { id: 'admin_1', role: 'admin' } }
   * );
   *
   * // Confirmed operation
   * const result = await transferTool.execute(
   *   { amount: 1000 },
   *   context,
   *   { confirmed: true }
   * );
   * ```
   */
  async execute(
    args: unknown,
    context: ExoContext = {},
    options: ExecutionOptions = {},
  ): Promise<ExoExecutionResult<TOutput>> {
    const middleware = this.config.middleware || [];

    const startFn: PipelineFn = async (
      coreArgs?: unknown,
      coreContext?: ExoContext,
    ) => this._executeCore(coreArgs ?? args, coreContext ?? context, options);

    // Create the pipeline execution chain
    const pipeline = middleware.reduceRight<PipelineFn>((next, mw) => {
      return async (pipelineArgs?: unknown, pipelineContext?: ExoContext) => {
        return mw({
          toolName: this.name,
          args: pipelineArgs ?? args,
          context: pipelineContext ?? context,
          next: async () => next(pipelineArgs, pipelineContext),
        });
      };
    }, startFn);

    // Start the pipeline
    // Cast to TOutput as middleware system uses unknown/any
    return (await pipeline(args, context)) as ExoExecutionResult<TOutput>;
  }

  /**
   * The core execution logic (validation, risk check, execution).
   * This is what gets called at the end of the middleware pipeline.
   */
  private async _executeCore(
    args: unknown,
    context: ExoContext,
    options: ExecutionOptions,
  ): Promise<ExoExecutionResult<TOutput>> {
    const startTime = performance.now();

    // Step 1: Validate arguments
    const validationResult = this.validate(args);

    if (!validationResult.success) {
      const fieldErrors = (validationResult.errors ?? []).map((errorMsg) => {
        const colonIndex = errorMsg.indexOf(":");
        if (colonIndex > 0) {
          return {
            field: errorMsg.substring(0, colonIndex),
            message: errorMsg.substring(colonIndex + 2),
          };
        }
        return { field: "_root", message: errorMsg };
      });

      throw new ValidationError(
        `Validation failed for tool "${this.name}"`,
        fieldErrors,
        { args },
      );
    }

    // Step 2: Permission check for HIGH risk tools
    if (this.config.riskLevel === "HIGH") {
      const userRole = context.user?.role;
      const isAdmin = userRole === "admin" || context.isAdmin === true;
      const hasSudo = options.sudo === true;

      if (!isAdmin && !hasSudo) {
        throw new RiskViolationError(this.name, "admin", userRole, {
          args: validationResult.data,
          toolName: this.name,
          riskLevel: this.config.riskLevel,
        });
      }
    }

    // Step 3: Confirmation check
    if (this.config.requiresConfirmation && options.confirmed !== true) {
      throw new ConfirmationRequiredError(this.name, validationResult.data, {
        toolName: this.name,
        riskLevel: this.config.riskLevel,
      });
    }

    // Step 4: Fire onStart hook
    await this.safeFireHook("onStart", {
      toolName: this.name,
      args: validationResult.data,
      context,
    });

    // Step 5: Execute the tool
    try {
      const data = await this.executor(validationResult.data!, context);
      const duration = performance.now() - startTime;

      // Fire onSuccess hook
      await this.safeFireHook("onSuccess", {
        toolName: this.name,
        result: data,
        duration,
        context,
      });

      return {
        success: true,
        data,
        metadata: {
          executionTime: duration,
          toolName: this.name,
          riskLevel: this.config.riskLevel,
        },
      };
    } catch (error) {
      const duration = performance.now() - startTime;

      // Fire onError hook
      await this.safeFireHook("onError", {
        toolName: this.name,
        error: error instanceof Error ? error : new Error(String(error)),
        duration,
        context,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      // Wrap in ExecutionError for consistent handling
      throw new ExecutionError(
        `Execution failed for tool "${this.name}": ${errorMessage}`,
        error instanceof Error ? error : undefined,
        {
          args: validationResult.data,
          executionTime: duration,
          toolName: this.name,
        },
      );
    }
  }

  /**
   * Safely executes a lifecycle hook without letting errors crash execution.
   */
  private async safeFireHook<K extends keyof ExoHooks>(
    hookName: K,
    payload: Parameters<NonNullable<ExoHooks[K]>>[0],
  ): Promise<void> {
    const hook = this.config.hooks?.[hookName];
    if (!hook) return;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await Promise.resolve(hook(payload as any));
    } catch {
      // Silently ignore hook errors - they should not crash the main execution
      // In production, you might want to log this to a separate error channel
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Returns a string representation of the tool.
   */
  toString(): string {
    return `ExoTool(${this.name})`;
  }

  /**
   * Returns a JSON-serializable representation of the tool.
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      description: this.description,
      config: this.config,
    };
  }
}
