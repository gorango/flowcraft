import type { WorkflowTool } from '../types'
import { createCreateBlueprintTool } from '../compose/create'
import { createModifyBlueprintTool } from '../compose/modify'
import { createValidateBlueprintTool } from '../compose/validate'
import { createDescribeBlueprintTool } from '../compose/describe'
import { createCheckNodeImplementationsTool } from '../compose/check-implementations'
import { createGenerateFromTemplateTool } from '../compose/generate-template'
import { createAddRetryConfigTool } from '../compose/add-retry-config'
import { createAddFallbackNodeTool } from '../compose/add-fallback'
import { createCheckDataFlowTool } from '../compose/check-data-flow'
import { createSimulateExecutionTool } from '../compose/simulate'
import { createOptimizeForParallelismTool } from '../compose/optimize-parallelism'
import { createGetBlueprintDiffTool } from '../compose/get-diff'
import type { ToolsDeps } from './types'

export function createComposeTools(deps: ToolsDeps): WorkflowTool[] {
	const tools: WorkflowTool[] = []

	if (deps.generate) {
		tools.push(createCreateBlueprintTool({ generate: deps.generate }))
	}

	tools.push(createModifyBlueprintTool())
	tools.push(createValidateBlueprintTool())
	tools.push(createDescribeBlueprintTool())

	tools.push(
		createCheckNodeImplementationsTool(deps.registry ? { registry: deps.registry } : undefined),
	)

	if (deps.templates) {
		tools.push(
			createGenerateFromTemplateTool({
				templates: deps.templates,
				generate: deps.generate,
			}),
		)
	}

	tools.push(createAddRetryConfigTool())
	tools.push(createAddFallbackNodeTool())
	tools.push(createCheckDataFlowTool())
	tools.push(createSimulateExecutionTool())
	tools.push(createOptimizeForParallelismTool())
	tools.push(createGetBlueprintDiffTool())

	return tools
}
