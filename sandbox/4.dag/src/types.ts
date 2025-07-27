// A generic structure for the `inputs` object in our node data.
// It maps a template key to a context key (or an array of fallback keys).
export type NodeInputMap = Record<string, string | string[]>
