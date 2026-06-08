/** @step */
export const greet = async (params: { name: string }) => {
	return { message: `hello ${params.name}` }
}

/** @flow */
export const sayHelloFlow = async (context: any) => {
	const name = await context.get('name')
	const result = await greet({ name })
	return result
}
