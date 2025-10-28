# @flowcraft/compiler

Programmatic API for compiling imperative workflows into declarative blueprints.

## `compileProject()`

Compiles workflow files and returns the compilation result.

```typescript
function compileProject(options: CompileOptions): Promise<CompilationOutput>
```

### Parameters

- **`options.entryPoints`**: `string[]` - Array of glob patterns matching workflow files
- **`options.tsConfigPath?`**: `string` - Path to tsconfig.json (defaults to './tsconfig.json')

### Returns

```typescript
interface CompilationOutput {
  blueprints: Blueprint[]
  registry: FlowRegistry
  diagnostics: CompilationDiagnostic[]
  manifestSource: string
}
```

- **`blueprints`**: Array of compiled blueprint objects ready for execution
- **`registry`**: Registry containing all discovered flows and steps with their metadata
- **`diagnostics`**: Array of compilation errors or warnings
- **`manifestSource`**: Generated TypeScript code that exports all blueprints

## `buildFlows()`

Convenience function that loads configuration from `flowcraft.config.ts` and writes the manifest file.

```typescript
function buildFlows(configPath?: string): Promise<void>
```

### Parameters

- **`configPath?`**: `string` - Path to config file (defaults to './flowcraft.config.ts')

This function:
1. Loads the configuration from `flowcraft.config.ts`
2. Compiles all workflows using `compileProject()`
3. Writes the generated manifest to the configured `manifestPath`
4. Throws an error if compilation fails

## Type Definitions

```typescript
interface FlowcraftConfig {
  entryPoints: string[]
  manifestPath: string
  tsConfigPath?: string
}

interface CompilationDiagnostic {
  file: string
  line: number
  column: number
  message: string
  severity: 'error' | 'warning'
}

interface Blueprint {
  id: string
  nodes: Node[]
  edges: Edge[]
  // ... additional blueprint properties
}

interface FlowRegistry {
  flows: Map<string, FlowDefinition>
  steps: Map<string, StepDefinition>
}
```