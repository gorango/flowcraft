// The configuration object defines the different scenarios this example can run.
export const config = {
	'1.blog-post': {
		mainWorkflowId: '100',
		initialContext: {
			topic: 'The rise of AI-powered workflow automation in modern software development.',
		},
	},
	'2.job-application': {
		mainWorkflowId: '200',
		initialContext: {
			applicantName: 'Jane Doe',
			resume: 'Experienced developer with a background in TypeScript, Node.js, and building complex DAG workflow systems. Also proficient in React and SQL.',
			coverLetter: 'To Whom It May Concern, I am writing to express my interest in the Senior Developer position.',
		},
	},
	'3.customer-review': {
		mainWorkflowId: '300',
		initialContext: {
			initial_review: 'The new dashboard is a huge improvement, but I noticed that the export-to-PDF feature is really slow and sometimes crashes the app on large datasets. It would be great if you could look into this.',
		},
	},
	'4.content-moderation': {
		mainWorkflowId: '400',
		initialContext: {
			userId: 'user-456',
			userPost: 'Hi, I need help with my account. My email is test@example.com and my phone is 555-123-4567.',
		},
	},
} as const
