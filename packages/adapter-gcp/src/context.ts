import type { Firestore } from '@google-cloud/firestore'
import { FieldValue } from '@google-cloud/firestore'
import type { IAsyncContext } from 'flowcraft'

export interface FirestoreContextOptions {
	client: Firestore
	collectionName: string
}

/**
 * A distributed context that persists state in a Google Cloud Firestore document.
 * Each workflow run gets its own document, identified by the runId.
 */
export class FirestoreContext implements IAsyncContext<Record<string, any>> {
	public readonly type = 'async' as const
	private readonly docRef: FirebaseFirestore.DocumentReference

	constructor(runId: string, options: FirestoreContextOptions) {
		this.docRef = options.client.collection(options.collectionName).doc(runId)
	}

	async get<K extends string>(key: K): Promise<any> {
		const doc = await this.docRef.get()
		if (doc.exists) {
			return doc.data()?.[key]
		}
		return undefined
	}

	async set<K extends string>(key: K, value: any): Promise<void> {
		// Use { merge: true } to perform an upsert, adding/updating the field
		// without overwriting the entire document.
		await this.docRef.set({ [key]: value }, { merge: true })
	}

	async has<K extends string>(key: K): Promise<boolean> {
		const doc = await this.docRef.get()
		return doc.exists && Object.hasOwn(doc.data() || {}, key)
	}

	async delete<K extends string>(key: K): Promise<boolean> {
		// Using FieldValue.delete() removes the specified field from the document.
		await this.docRef.update({ [key]: FieldValue.delete() })
		return true // Firestore's update does not return a boolean for field deletion success
	}

	async toJSON(): Promise<Record<string, any>> {
		const doc = await this.docRef.get()
		return doc.exists ? doc.data() || {} : {}
	}
}
