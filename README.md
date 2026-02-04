<p align="center">
  <h1 align="center">@fozooni/exo</h1>
  <p align="center"><strong>The Exoskeleton for your AI Agents.</strong></p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@fozooni/exo"><img src="https://img.shields.io/npm/v/@fozooni/exo.svg" alt="npm version"></a>
  <a href="https://github.com/fozooni/exo/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/@fozooni/exo.svg" alt="license"></a>
  <a href="https://github.com/fozooni/exo/actions"><img src="https://github.com/fozooni/exo/workflows/CI/badge.svg" alt="build status"></a>
</p>

---

## Why Exo?

**AI Agents are unpredictable.** They hallucinate arguments, ignore safety rails, and make it difficult to understand what went wrong.

**Exo** provides a strictly typed, deterministic security layer for your AI tools. Every input is validated, every high-risk action requires permission, and every execution is observable—regardless of which SDK you use.

## Features

- 🛡️ **Deterministic Safety** — Role-based access control with `HIGH/MEDIUM/LOW` risk levels and human-in-the-loop confirmation flows.
- 🔌 **Universal Adapters** — Works seamlessly with OpenAI SDK, Vercel AI SDK, and LangChain.
- 👁️ **Observability** — Zero-dependency lifecycle hooks for logging latency, errors, and custom telemetry.
- 🔒 **Type-Safe** — Built on Zod with full TypeScript inference for both inputs and outputs.
- ⚡ **Lightweight** — No external runtime dependencies beyond Zod.

## Quick Start

```bash
npm install @fozooni/exo zod
```

```typescript
import { z } from "zod";
import { createExoTool, RiskLevel } from "@fozooni/exo";

const weatherTool = createExoTool({
  name: "get_weather",
  description: "Gets the current weather for a city.",
  schema: z.object({
    city: z.string().describe("The city name"),
  }),
  executor: async ({ city }) => {
    return { city, temperature: 22, conditions: "sunny" };
  },
  config: {
    riskLevel: RiskLevel.LOW,
  },
});

// Execute directly
const result = await weatherTool.execute({ city: "Istanbul" });
console.log(result.data); // { city: 'Istanbul', temperature: 22, conditions: 'sunny' }

// Or get OpenAI-compatible spec
const spec = weatherTool.getOpenAISpec();
// Use with: openai.chat.completions.create({ tools: [spec] })
```

## Advanced Usage

### High-Risk Tools with Role-Based Access

```typescript
const deleteDatabase = createExoTool({
  name: "delete_database",
  description: "Permanently deletes a database. DANGEROUS.",
  schema: z.object({ confirm: z.literal(true) }),
  executor: async () => ({ deleted: true }),
  config: {
    riskLevel: RiskLevel.HIGH, // Requires admin role
  },
});

// ❌ Throws RiskViolationError
await deleteDatabase.execute(
  { confirm: true },
  { user: { id: "1", role: "guest" } },
);

// ✅ Works
await deleteDatabase.execute(
  { confirm: true },
  { user: { id: "1", role: "admin" } },
);
```

### Vercel AI SDK Integration

```typescript
import { Exo, toVercelTool } from "@fozooni/exo";
import { streamText } from "ai";

const exo = new Exo([weatherTool, searchTool]);

// Get all tools as Vercel-compatible object
const tools = exo.getVercelTools();

const result = await streamText({
  model: openai("gpt-4o"),
  tools,
  messages,
});
```

### Instant Debugging with Console Logger

```typescript
import { createExoTool, createConsoleLogger } from "@fozooni/exo";

const tool = createExoTool({
  name: "my_tool",
  schema: z.object({}),
  executor: async () => ({ ok: true }),
  config: {
    hooks: createConsoleLogger(),
  },
});

await tool.execute({});
// [EXO] ▶ START my_tool {}
// [EXO] ✓ SUCCESS my_tool (0.42ms)
```

### OpenAI Structured Outputs (Strict Mode)

```typescript
// Generate schema with additionalProperties: false
const strictSpec = weatherTool.getOpenAISpec({ strict: true });
```

## API Reference

### Core Classes

| Export            | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `ExoTool`         | Main tool class with validation, execution, and spec generation |
| `Exo`             | Registry for managing multiple tools                            |
| `createExoTool()` | Factory function with better type inference                     |

### Adapters

| Export              | Description                                       |
| ------------------- | ------------------------------------------------- |
| `toVercelTool()`    | Convert to Vercel AI SDK format                   |
| `toLangChainTool()` | Convert to LangChain DynamicStructuredTool format |

### Errors

| Export                      | Description                                               |
| --------------------------- | --------------------------------------------------------- |
| `ValidationError`           | Thrown when arguments fail Zod validation                 |
| `RiskViolationError`        | Thrown when a HIGH risk tool is called without permission |
| `ConfirmationRequiredError` | Thrown when confirmation is needed                        |

## Roadmap

- [x] Middleware pipeline for pre/post processing
- [x] Built-in rate limiting
- [ ] Telemetry integrations (OpenTelemetry, Datadog)
- [ ] Tool versioning and deprecation support

## Contributing

Contributions are welcome! Please read our contributing guidelines and submit a PR.

```bash
git clone https://github.com/fozooni/exo.git
cd exo
npm install
npm test
```

## License

MIT © [Fozooni](https://github.com/fozooni)
