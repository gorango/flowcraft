# Sanitizer

The `sanitizeBlueprint` function is a utility for cleaning up workflow blueprints that may contain extra properties added by UI tools or external sources. It ensures that only the core properties defined in the `NodeDefinition` and `EdgeDefinition` interfaces are retained, making the blueprint safe for execution.

## `sanitizeBlueprint(raw: any): WorkflowBlueprint`

Sanitizes a raw workflow blueprint by removing extraneous properties and keeping only the essential ones.

### Parameters

- `raw` (any): The raw blueprint object, which may include additional properties like UI positioning or styling.

### Returns

- `WorkflowBlueprint`: A sanitized blueprint with only the defined properties.

### Example

```typescript
import { sanitizeBlueprint } from 'flowcraft'

const rawBlueprint = {
  id: 'my-workflow',
  nodes: [
    {
      id: 'start',
      uses: 'my-node',
      params: {},
      inputs: {},
      config: {},
      position: { x: 100, y: 200 }, // Extra UI property
    },
  ],
  edges: [
    {
      source: 'start',
      target: 'end',
      action: 'success',
      style: { color: 'blue' }, // Extra UI property
    },
  ],
}

const sanitized = sanitizeBlueprint(rawBlueprint)
// sanitized.nodes[0] will only have id, uses, params, inputs, config
// sanitized.edges[0] will only have source, target, action, condition, transform
```

This function is particularly useful when importing blueprints from external sources or when building UIs that add metadata to the blueprint.