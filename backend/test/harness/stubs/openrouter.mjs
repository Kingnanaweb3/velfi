export const MODELS = { classifier: 'c', parser: 'p', assistant: 'a', doublecheck: 'd' }
export const scripted = []
export async function callModel() { return scripted.length ? scripted.shift() : 'assistant' }
