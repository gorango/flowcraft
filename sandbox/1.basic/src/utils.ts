export function callLLM(prompt: string): string {
	console.log(`[MOCK LLM] Processing prompt: ${prompt.substring(0, 50)}...`)

	if (prompt.includes('outline') && prompt.includes('sections')) {
		return `sections:
  - Introduction to the Topic
  - Key Concepts and Applications
  - Future Implications`
	}

	if (prompt.includes('paragraph') && prompt.includes('100 WORDS')) {
		const section = prompt.match(/"([^"]+)"/)?.[1] || 'the topic'
		return `This section covers ${section} in detail. It's an important concept that helps us understand the broader implications. For example, consider how this applies in real-world scenarios. The key takeaway is that understanding this concept enables better decision-making and practical applications in various contexts.`
	}

	if (prompt.includes('conversational') && prompt.includes('engaging')) {
		return `Have you ever wondered about this fascinating topic? Let me take you on a journey through these important concepts.

## Introduction to the Topic

This section covers Introduction to the Topic in detail. It's an important concept that helps us understand the broader implications. For example, consider how this applies in real-world scenarios. The key takeaway is that understanding this concept enables better decision-making and practical applications in various contexts.

## Key Concepts and Applications

This section covers Key Concepts and Applications in detail. It's an important concept that helps us understand the broader implications. For example, consider how this applies in real-world scenarios. The key takeaway is that understanding this concept enables better decision-making and practical applications in various contexts.

## Future Implications

This section covers Future Implications in detail. It's an important concept that helps us understand the broader implications. For example, consider how this applies in real-world scenarios. The key takeaway is that understanding this concept enables better decision-making and practical applications in various contexts.

In conclusion, these concepts work together to create a comprehensive understanding that will serve you well in future endeavors.`
	}

	return `Mock response for: ${prompt.substring(0, 100)}`
}
