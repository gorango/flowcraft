/** @step */
export async function riskyAction() {
	throw new Error('Database disconnected')
}

/** @step */
export async function logError(params: { msg: string }) {
	return { logged: params.msg }
}

/** @flow */
export async function catchErrorFlow() {
	try {
		await riskyAction()
	} catch (e: any) {
		await logError({ msg: e.message })
	}
}
