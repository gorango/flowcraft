/** @step */
export async function getComplexPayload() {
	return {
		user: {
			profile: {
				address: { zip: '90210' },
			},
		},
	}
}

/** @step */
export async function useZip(params: { zip: string }) {
	return params.zip
}

/** @flow */
export async function deepPropertyFlow() {
	const payload = await getComplexPayload()
	await useZip({ zip: payload.user.profile.address.zip })
}
