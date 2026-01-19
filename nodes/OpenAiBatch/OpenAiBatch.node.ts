import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

interface BatchRequest {
	custom_id: string;
	method: string;
	url: string;
	body: Record<string, unknown>;
}

interface BatchResponse {
	id: string;
	custom_id: string;
	response: {
		status_code: number;
		request_id: string;
		body: Record<string, unknown>;
	};
	error: null | {
		code: string;
		message: string;
	};
}

interface BatchStatus {
	id: string;
	object: string;
	endpoint: string;
	errors: null | {
		object: string;
		data: Array<{
			code: string;
			message: string;
			param: string | null;
			line: number | null;
		}>;
	};
	input_file_id: string;
	completion_window: string;
	status: 'validating' | 'failed' | 'in_progress' | 'finalizing' | 'completed' | 'expired' | 'cancelling' | 'cancelled';
	output_file_id: string | null;
	error_file_id: string | null;
	created_at: number;
	in_progress_at: number | null;
	expires_at: number | null;
	finalizing_at: number | null;
	completed_at: number | null;
	failed_at: number | null;
	expired_at: number | null;
	cancelling_at: number | null;
	cancelled_at: number | null;
	request_counts: {
		total: number;
		completed: number;
		failed: number;
	};
	metadata: Record<string, string> | null;
}

export class OpenAiBatch implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenAI Batch',
		name: 'openAiBatch',
		icon: 'file:openai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Execute batch requests to OpenAI API',
		defaults: {
			name: 'OpenAI Batch',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'openAiApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Chat Completion',
						value: 'chatCompletion',
						description: 'Create chat completions in batch',
						action: 'Create chat completions in batch',
					},
					{
						name: 'Embeddings',
						value: 'embeddings',
						description: 'Create embeddings in batch',
						action: 'Create embeddings in batch',
					},
				],
				default: 'chatCompletion',
			},
			// Chat Completion Options
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['chatCompletion'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getChatModels',
				},
				default: 'gpt-4o-mini',
				description: 'The model to use for chat completion',
			},
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['chatCompletion'],
					},
				},
				options: [
					{
						name: 'Simple',
						value: 'simple',
						description: 'Just provide a prompt (user message)',
					},
					{
						name: 'Advanced',
						value: 'advanced',
						description: 'Configure full message array with roles',
					},
				],
				default: 'simple',
				description: 'How to provide input messages',
			},
			{
				displayName: 'Prompt',
				name: 'prompt',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						operation: ['chatCompletion'],
						inputMode: ['simple'],
					},
				},
				default: '',
				description: 'The prompt to send. Use expressions like {{ $json.prompt }} to reference input data.',
			},
			{
				displayName: 'System Prompt',
				name: 'systemPrompt',
				type: 'string',
				typeOptions: {
					rows: 2,
				},
				displayOptions: {
					show: {
						operation: ['chatCompletion'],
						inputMode: ['simple'],
					},
				},
				default: '',
				description: 'Optional system prompt to set the behavior of the assistant',
			},
			{
				displayName: 'Messages',
				name: 'messages',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						operation: ['chatCompletion'],
						inputMode: ['advanced'],
					},
				},
				default: {},
				placeholder: 'Add Message',
				options: [
					{
						name: 'messagesValues',
						displayName: 'Message',
						values: [
							{
								displayName: 'Role',
								name: 'role',
								type: 'options',
								options: [
									{
										name: 'System',
										value: 'system',
									},
									{
										name: 'User',
										value: 'user',
									},
									{
										name: 'Assistant',
										value: 'assistant',
									},
								],
								default: 'user',
							},
							{
								displayName: 'Content',
								name: 'content',
								type: 'string',
								typeOptions: {
									rows: 4,
								},
								default: '',
								description: 'The content of the message. Use expressions like {{ $json.text }} to reference input data.',
							},
						],
					},
				],
				description: 'The messages for the chat completion',
			},
			// Embeddings Options
			{
				displayName: 'Embedding Model',
				name: 'embeddingModel',
				type: 'options',
				displayOptions: {
					show: {
						operation: ['embeddings'],
					},
				},
				typeOptions: {
					loadOptionsMethod: 'getEmbeddingModels',
				},
				default: 'text-embedding-3-small',
				description: 'The model to use for embeddings',
			},
			{
				displayName: 'Input Text',
				name: 'inputText',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						operation: ['embeddings'],
					},
				},
				default: '',
				description: 'The text to embed. Use expressions like {{ $json.text }} to reference input data.',
			},
			// Common Options
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Max Tokens',
						name: 'maxTokens',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['chatCompletion'],
							},
						},
						default: 1000,
						description: 'Maximum number of tokens to generate',
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						displayOptions: {
							show: {
								'/operation': ['chatCompletion'],
							},
						},
						typeOptions: {
							minValue: 0,
							maxValue: 2,
							numberPrecision: 1,
						},
						default: 1,
						description: 'Controls randomness. Lower is more deterministic.',
					},
					{
						displayName: 'Polling Interval (Seconds)',
						name: 'pollingInterval',
						type: 'number',
						default: 30,
						description: 'How often to check batch status',
					},
					{
						displayName: 'Timeout (Minutes)',
						name: 'timeout',
						type: 'number',
						default: 1440,
						description: 'Maximum time to wait for batch completion (default 24 hours)',
					},
					{
						displayName: 'Metadata',
						name: 'metadata',
						type: 'json',
						default: '{}',
						description: 'Optional metadata to attach to the batch',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getChatModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'openAiApi',
						{
							method: 'GET',
							url: 'https://api.openai.com/v1/models',
						},
					) as { data: Array<{ id: string; owned_by: string }> };

					const chatModels = response.data
						.filter((model) => {
							const id = model.id.toLowerCase();
							return (
								id.includes('gpt') ||
								id.includes('o1') ||
								id.includes('o3') ||
								id.includes('chatgpt')
							) && !id.includes('instruct') && !id.includes('audio') && !id.includes('realtime');
						})
						.map((model) => ({
							name: model.id,
							value: model.id,
						}))
						.sort((a, b) => a.name.localeCompare(b.name));

					return chatModels.length > 0 ? chatModels : [{ name: 'gpt-4o-mini', value: 'gpt-4o-mini' }];
				} catch (error) {
					return [
						{ name: 'gpt-4o-mini', value: 'gpt-4o-mini' },
						{ name: 'gpt-4o', value: 'gpt-4o' },
						{ name: 'gpt-4-turbo', value: 'gpt-4-turbo' },
					];
				}
			},

			async getEmbeddingModels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				try {
					const response = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'openAiApi',
						{
							method: 'GET',
							url: 'https://api.openai.com/v1/models',
						},
					) as { data: Array<{ id: string; owned_by: string }> };

					const embeddingModels = response.data
						.filter((model) => model.id.toLowerCase().includes('embedding'))
						.map((model) => ({
							name: model.id,
							value: model.id,
						}))
						.sort((a, b) => a.name.localeCompare(b.name));

					return embeddingModels.length > 0 ? embeddingModels : [{ name: 'text-embedding-3-small', value: 'text-embedding-3-small' }];
				} catch (error) {
					return [
						{ name: 'text-embedding-3-small', value: 'text-embedding-3-small' },
						{ name: 'text-embedding-3-large', value: 'text-embedding-3-large' },
					];
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const operation = this.getNodeParameter('operation', 0) as string;
		const options = this.getNodeParameter('options', 0, {}) as {
			maxTokens?: number;
			temperature?: number;
			pollingInterval?: number;
			timeout?: number;
			metadata?: string;
		};

		const pollingInterval = (options.pollingInterval || 30) * 1000;
		const timeout = (options.timeout || 1440) * 60 * 1000;

		// Build batch requests from input items
		const batchRequests: BatchRequest[] = [];

		for (let i = 0; i < items.length; i++) {
			let request: BatchRequest;

			if (operation === 'chatCompletion') {
				const model = this.getNodeParameter('model', i) as string;
				const inputMode = this.getNodeParameter('inputMode', i, 'simple') as string;

				let messages: Array<{ role: string; content: string }>;

				if (inputMode === 'simple') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const systemPrompt = this.getNodeParameter('systemPrompt', i, '') as string;

					messages = [];
					if (systemPrompt) {
						messages.push({ role: 'system', content: systemPrompt });
					}
					messages.push({ role: 'user', content: prompt });
				} else {
					const messagesParam = this.getNodeParameter('messages.messagesValues', i, []) as Array<{
						role: string;
						content: string;
					}>;

					messages = messagesParam.map((msg) => ({
						role: msg.role,
						content: msg.content,
					}));
				}

				const body: Record<string, unknown> = {
					model,
					messages,
				};

				if (options.maxTokens) {
					body.max_tokens = options.maxTokens;
				}
				if (options.temperature !== undefined) {
					body.temperature = options.temperature;
				}

				request = {
					custom_id: `request-${i}`,
					method: 'POST',
					url: '/v1/chat/completions',
					body,
				};
			} else if (operation === 'embeddings') {
				const model = this.getNodeParameter('embeddingModel', i) as string;
				const inputText = this.getNodeParameter('inputText', i) as string;

				request = {
					custom_id: `request-${i}`,
					method: 'POST',
					url: '/v1/embeddings',
					body: {
						model,
						input: inputText,
					},
				};
			} else {
				throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`);
			}

			batchRequests.push(request);
		}

		// Create JSONL content
		const jsonlContent = batchRequests.map((req) => JSON.stringify(req)).join('\n');

		// Upload JSONL file to OpenAI
		const uploadResponse = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'openAiApi',
			{
				method: 'POST',
				url: 'https://api.openai.com/v1/files',
				headers: {
					'Content-Type': 'multipart/form-data',
				},
				body: {
					purpose: 'batch',
					file: {
						value: Buffer.from(jsonlContent, 'utf-8'),
						options: {
							filename: 'batch_requests.jsonl',
							contentType: 'application/jsonl',
						},
					},
				},
			},
		);

		const inputFileId = uploadResponse.id;

		// Create batch
		let metadata: Record<string, string> | undefined;
		try {
			if (options.metadata) {
				metadata = JSON.parse(options.metadata);
			}
		} catch (e) {
			throw new NodeOperationError(this.getNode(), 'Invalid metadata JSON');
		}

		const batchCreateBody: Record<string, unknown> = {
			input_file_id: inputFileId,
			endpoint: operation === 'chatCompletion' ? '/v1/chat/completions' : '/v1/embeddings',
			completion_window: '24h',
		};

		if (metadata && Object.keys(metadata).length > 0) {
			batchCreateBody.metadata = metadata;
		}

		const batchResponse = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'openAiApi',
			{
				method: 'POST',
				url: 'https://api.openai.com/v1/batches',
				headers: {
					'Content-Type': 'application/json',
				},
				body: batchCreateBody,
			},
		) as BatchStatus;

		const batchId = batchResponse.id;

		// Poll for batch completion
		const startTime = Date.now();
		let batchStatus: BatchStatus;

		do {
			await new Promise((resolve) => setTimeout(resolve, pollingInterval));

			batchStatus = await this.helpers.httpRequestWithAuthentication.call(
				this,
				'openAiApi',
				{
					method: 'GET',
					url: `https://api.openai.com/v1/batches/${batchId}`,
				},
			) as BatchStatus;

			if (Date.now() - startTime > timeout) {
				throw new NodeOperationError(
					this.getNode(),
					`Batch processing timed out after ${options.timeout || 1440} minutes. Batch ID: ${batchId}`,
				);
			}

			if (batchStatus.status === 'failed') {
				const errorMessages = batchStatus.errors?.data?.map(e => e.message).join(', ') || 'Unknown error';
				throw new NodeApiError(this.getNode(), {}, {
					message: `Batch processing failed: ${errorMessages}`,
					description: `Batch ID: ${batchId}`,
				});
			}

			if (batchStatus.status === 'expired') {
				throw new NodeOperationError(this.getNode(), `Batch expired. Batch ID: ${batchId}`);
			}

			if (batchStatus.status === 'cancelled') {
				throw new NodeOperationError(this.getNode(), `Batch was cancelled. Batch ID: ${batchId}`);
			}

		} while (batchStatus.status !== 'completed');

		// Download results
		if (!batchStatus.output_file_id) {
			throw new NodeOperationError(this.getNode(), 'Batch completed but no output file was created');
		}

		const outputFileResponse = await this.helpers.httpRequestWithAuthentication.call(
			this,
			'openAiApi',
			{
				method: 'GET',
				url: `https://api.openai.com/v1/files/${batchStatus.output_file_id}/content`,
				returnFullResponse: true,
				json: false,
			},
		);

		const outputContent = typeof outputFileResponse === 'string'
			? outputFileResponse
			: typeof outputFileResponse.body === 'string'
				? outputFileResponse.body
				: JSON.stringify(outputFileResponse.body);

		// Parse JSONL response
		const outputLines = outputContent.trim().split('\n');
		const results: BatchResponse[] = outputLines.map((line: string) => JSON.parse(line));

		// Map results back to input items order
		const resultMap = new Map<string, BatchResponse>();
		for (const result of results) {
			resultMap.set(result.custom_id, result);
		}

		// Create output items
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			const customId = `request-${i}`;
			const result = resultMap.get(customId);

			if (result) {
				if (result.error) {
					returnData.push({
						json: {
							...items[i].json,
							error: result.error,
							batchId,
							customId,
						},
						pairedItem: { item: i },
					});
				} else {
					const responseBody = result.response.body;

					if (operation === 'chatCompletion') {
						const choices = responseBody.choices as Array<{
							message: { content: string; role: string };
							index: number;
							finish_reason: string;
						}>;

						returnData.push({
							json: {
								...items[i].json,
								response: choices[0]?.message?.content || '',
								fullResponse: responseBody,
								batchId,
								customId,
							},
							pairedItem: { item: i },
						});
					} else if (operation === 'embeddings') {
						const data = responseBody.data as Array<{
							embedding: number[];
							index: number;
						}>;

						returnData.push({
							json: {
								...items[i].json,
								embedding: data[0]?.embedding || [],
								fullResponse: responseBody,
								batchId,
								customId,
							},
							pairedItem: { item: i },
						});
					}
				}
			} else {
				returnData.push({
					json: {
						...items[i].json,
						error: { message: 'No result found for this request' },
						batchId,
						customId,
					},
					pairedItem: { item: i },
				});
			}
		}

		return [returnData];
	}
}
