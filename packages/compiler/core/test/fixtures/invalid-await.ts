/** @flow */
export async function invalidAwaitFlow(_context: any) {
	await helperFunction()
}

/** @step */
export async function validStep() {
	return 'valid'
}

// This is a plain async function without @step tag
export async function helperFunction() {
	return 'helper'
}
