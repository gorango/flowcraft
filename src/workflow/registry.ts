import type { AbstractNode } from './AbstractNode'
import type { Flow } from './Flow'

// A type alias for the Flow class constructor.
type FlowConstructor = new (start?: AbstractNode) => Flow

let flowConstructor: FlowConstructor | undefined

/**
 * For internal use by the Flow class to register itself, breaking the circular dependency.
 * @internal
 */
export function registerFlow(constructor: FlowConstructor): void {
	flowConstructor = constructor
}

/**
 * For internal use by the Node class to get the Flow constructor without a direct import.
 * @internal
 */
export function getFlowConstructor(): FlowConstructor {
	if (!flowConstructor) {
		throw new Error(
			'Flow constructor has not been registered. This is an internal error in the framework, likely due to a module loading issue.',
		)
	}
	return flowConstructor
}
