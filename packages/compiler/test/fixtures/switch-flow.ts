/** @step */
export async function handleAdmin() {
	return { role: 'admin' }
}

/** @step */
export async function handleUser() {
	return { role: 'user' }
}

/** @step */
export async function handleGuest() {
	return { role: 'guest' }
}

/** @step */
export async function logActivity(params: { role: string }) {
	return { logged: true, role: params.role }
}

/** @flow */
export async function switchFlow(context: any) {
	const role = await context.get('role')

	switch (role) {
		case 'admin':
			await handleAdmin()
			break
		case 'user':
			await handleUser()
			break
		default:
			await handleGuest()
	}

	await logActivity({ role })
}
