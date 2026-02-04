/**
 * @fozooni/exo - Middleware Tests
 *
 * Test suite for middleware system:
 * - Pipeline execution order
 * - Argument modification
 * - Result modification
 * - Rate limiting
 */

import { z } from "zod";
import {
  createExoTool,
  createRateLimiter,
  ExoMiddleware,
  RiskLevel,
} from "../src";

// ============================================================================
// Test Fixtures
// ============================================================================

const echoTool = createExoTool({
  name: "echo",
  description: "Echoes the input.",
  schema: z.object({ value: z.string() }),
  executor: async ({ value }) => ({ value }),
});

// ============================================================================
// Middleware Structure Tests
// ============================================================================

describe("Middleware System", () => {
  it("should execute middleware in order", async () => {
    const executionOrder: string[] = [];

    const mw1: ExoMiddleware = async ({ next }) => {
      executionOrder.push("mw1-start");
      const result = await next();
      executionOrder.push("mw1-end");
      return result;
    };

    const mw2: ExoMiddleware = async ({ next }) => {
      executionOrder.push("mw2-start");
      const result = await next();
      executionOrder.push("mw2-end");
      return result;
    };

    const tool = createExoTool({
      name: "ordered_tool",
      description: "Test ordering",
      schema: z.object({}),
      executor: async () => ({}),
      config: { middleware: [mw1, mw2] },
    });

    await tool.execute({});

    expect(executionOrder).toEqual([
      "mw1-start",
      "mw2-start",
      "mw2-end",
      "mw1-end",
    ]);
  });

  it("should allow middleware to block execution", async () => {
    const blocker: ExoMiddleware = async () => {
      // Don't call next()
      return {
        success: false,
        error: "Blocked",
        metadata: { blocked: true },
      };
    };

    const executor = jest.fn();
    const tool = createExoTool({
      name: "blocked_tool",
      description: "Blocked",
      schema: z.object({}),
      executor,
      config: { middleware: [blocker] },
    });

    const result = await tool.execute({});

    expect(result.success).toBe(false);
    expect(result.error).toBe("Blocked");
    expect(executor).not.toHaveBeenCalled();
  });

  it("should allow middleware to modify args (if cautious)", async () => {
    // Note: modifying args requires careful typing or casting
    const modifier: ExoMiddleware = async ({ args, next }) => {
      const typedArgs = args as { value: string };
      // Pass modified args to next() - wait, our pipeline binds 'args' in closure.
      // But 'next()' calls the next middleware which uses 'args' from ITS closure.
      // So simple arg modification requires 'args' to be mutable object.
      typedArgs.value = "modified";
      return next();
    };

    const tool = createExoTool({
      name: "modify_args",
      description: "Modify args",
      schema: z.object({ value: z.string() }),
      executor: async ({ value }) => ({ value }),
      config: { middleware: [modifier] },
    });

    const result = await tool.execute({ value: "original" });
    // @ts-expect-error - we know the result structure
    expect(result.data.value).toBe("modified");
  });
});

// ============================================================================
// Rate Limiter Tests
// ============================================================================

describe("Rate Limiter Middleware", () => {
  it("should execute first N requests", async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      limit: 2,
    });

    const tool = createExoTool({
      name: "limited_tool",
      description: "Limited",
      schema: z.object({}),
      executor: async () => ({ ok: true }),
      config: { middleware: [limiter] },
    });

    // Request 1: OK
    const r1 = await tool.execute({});
    expect(r1.success).toBe(true);

    // Request 2: OK
    const r2 = await tool.execute({});
    expect(r2.success).toBe(true);
  });

  it("should block requests over limit", async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      limit: 1,
    });

    const tool = createExoTool({
      name: "limited_tool_2",
      description: "Limited",
      schema: z.object({}),
      executor: async () => ({ ok: true }),
      config: { middleware: [limiter] },
    });

    // Request 1: OK
    await tool.execute({});

    // Request 2: Blocked
    const r2 = await tool.execute({});
    expect(r2.success).toBe(false);
    expect(r2.error).toMatch(/Rate limit exceeded/);
  });

  it("should track limits independently per tool (default)", async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      limit: 1,
    });

    const tool1 = createExoTool({
      name: "tool_1",
      description: "T1",
      schema: z.object({}),
      executor: async () => ({}),
      config: { middleware: [limiter] },
    });

    const tool2 = createExoTool({
      name: "tool_2",
      description: "T2",
      schema: z.object({}),
      executor: async () => ({}),
      config: { middleware: [limiter] },
    });

    // Tool 1 used once
    await tool1.execute({});

    // Tool 2 should still work (different key: toolName:global)
    const r2 = await tool2.execute({});
    expect(r2.success).toBe(true);
  });

  it("should track limits per user if context provided", async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      limit: 1,
    });

    const tool = createExoTool({
      name: "user_limited",
      description: "User limited",
      schema: z.object({}),
      executor: async () => ({}),
      config: { middleware: [limiter] },
    });

    const user1 = { user: { id: "u1", role: "user" } };
    const user2 = { user: { id: "u2", role: "user" } };

    // User 1 uses limit
    await tool.execute({}, user1);

    // User 1 again -> Blocked
    const r2 = await tool.execute({}, user1);
    expect(r2.success).toBe(false);

    // User 2 -> OK
    const r3 = await tool.execute({}, user2);
    expect(r3.success).toBe(true);
  });
});
