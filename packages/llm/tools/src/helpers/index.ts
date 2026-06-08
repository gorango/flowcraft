export { createActionTools } from './actions'
export { createComposeTools } from './compose'
export { createDiscoverTools } from './discover'
export { createOrchestrateTools } from './orchestrate'
export type { ToolsDeps } from './types'

import type { WorkflowTool } from '../types'
import type { ToolsDeps } from './types'
import { createActionTools } from './actions'
import { createComposeTools } from './compose'
import { createDiscoverTools } from './discover'
import { createOrchestrateTools } from './orchestrate'

export function createAllTools(deps: ToolsDeps): WorkflowTool[] {
	return [
		...createActionTools(deps),
		...createComposeTools(deps),
		...createDiscoverTools(deps),
		...createOrchestrateTools(deps),
	]
}
