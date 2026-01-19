import * as dotenv from 'dotenv';
import * as https from 'https';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const API_KEY = process.env.OPENAI_API_KEY;

if (!API_KEY) {
	console.error('Error: OPENAI_API_KEY not found in .env file');
	process.exit(1);
}

interface BatchRequest {
	custom_id: string;
	method: string;
	url: string;
	body: Record<string, unknown>;
}

function makeRequest(
	method: string,
	path: string,
	body?: unknown,
	isMultipart = false
): Promise<unknown> {
	return new Promise((resolve, reject) => {
		const headers: Record<string, string | number> = {
			Authorization: `Bearer ${API_KEY}`,
		};

		if (body && !isMultipart) {
			headers['Content-Type'] = 'application/json';
		}

		const options: https.RequestOptions = {
			hostname: 'api.openai.com',
			port: 443,
			path,
			method,
			headers,
		};

		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				try {
					resolve(JSON.parse(data));
				} catch {
					resolve(data);
				}
			});
		});

		req.on('error', reject);

		if (body && !isMultipart) {
			req.write(JSON.stringify(body));
		} else if (body && isMultipart) {
			req.write(body);
		}

		req.end();
	});
}

function createMultipartBody(
	jsonlContent: string,
	boundary: string
): { body: Buffer; contentType: string } {
	const parts: Buffer[] = [];

	// Purpose field
	parts.push(Buffer.from(`--${boundary}\r\n`));
	parts.push(Buffer.from('Content-Disposition: form-data; name="purpose"\r\n\r\n'));
	parts.push(Buffer.from('batch\r\n'));

	// File field
	parts.push(Buffer.from(`--${boundary}\r\n`));
	parts.push(
		Buffer.from(
			'Content-Disposition: form-data; name="file"; filename="batch_requests.jsonl"\r\n'
		)
	);
	parts.push(Buffer.from('Content-Type: application/jsonl\r\n\r\n'));
	parts.push(Buffer.from(jsonlContent));
	parts.push(Buffer.from('\r\n'));

	// End boundary
	parts.push(Buffer.from(`--${boundary}--\r\n`));

	return {
		body: Buffer.concat(parts),
		contentType: `multipart/form-data; boundary=${boundary}`,
	};
}

function uploadFile(jsonlContent: string): Promise<{ id: string }> {
	return new Promise((resolve, reject) => {
		const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
		const { body, contentType } = createMultipartBody(jsonlContent, boundary);

		const options: https.RequestOptions = {
			hostname: 'api.openai.com',
			port: 443,
			path: '/v1/files',
			method: 'POST',
			headers: {
				Authorization: `Bearer ${API_KEY}`,
				'Content-Type': contentType,
				'Content-Length': body.length,
			},
		};

		const req = https.request(options, (res) => {
			let data = '';
			res.on('data', (chunk) => (data += chunk));
			res.on('end', () => {
				try {
					const parsed = JSON.parse(data);
					if (parsed.error) {
						reject(new Error(parsed.error.message));
					} else {
						resolve(parsed);
					}
				} catch {
					reject(new Error(data));
				}
			});
		});

		req.on('error', reject);
		req.write(body);
		req.end();
	});
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testBatch() {
	console.log('🚀 Starting OpenAI Batch API test with 1-minute fallback deadline...\n');

	// Configuration
	const FALLBACK_DEADLINE_MS = 60 * 1000; // 1 minute
	const POLL_INTERVAL_MS = 5000; // 5 seconds

	// Create test requests
	const testMessages = [
		'Say "Hello, test 1!" and nothing else.',
		'Say "Hello, test 2!" and nothing else.',
		'Say "Hello, test 3!" and nothing else.',
	];

	const batchRequests: BatchRequest[] = testMessages.map((msg, i) => ({
		custom_id: `request-${i}`,
		method: 'POST',
		url: '/v1/chat/completions',
		body: {
			model: 'gpt-4o-mini',
			messages: [{ role: 'user', content: msg }],
			max_tokens: 50,
		},
	}));

	// Create JSONL
	const jsonlContent = batchRequests.map((r) => JSON.stringify(r)).join('\n');
	console.log('📄 JSONL Content:');
	console.log(jsonlContent);
	console.log();

	// Upload file
	console.log('📤 Uploading JSONL file...');
	const fileResponse = await uploadFile(jsonlContent);
	console.log(`✅ File uploaded: ${fileResponse.id}\n`);

	// Create batch
	console.log('🔄 Creating batch...');
	const batchResponse = (await makeRequest('POST', '/v1/batches', {
		input_file_id: fileResponse.id,
		endpoint: '/v1/chat/completions',
		completion_window: '24h',
	})) as { id: string; status: string; error?: { message: string } };

	if (batchResponse.error) {
		throw new Error(batchResponse.error.message);
	}

	console.log(`✅ Batch created: ${batchResponse.id}`);
	console.log(`   Status: ${batchResponse.status}\n`);

	// Poll for completion with fallback deadline
	console.log(`⏳ Waiting for batch to complete (fallback deadline: 1 minute)...`);
	const startTime = Date.now();
	let status = batchResponse.status;
	let batchInfo: {
		status: string;
		output_file_id?: string;
		request_counts?: { total: number; completed: number; failed: number };
	};
	let deadlineReached = false;

	// Track results from batch
	const resultMap = new Map<string, { content: string; fallback: boolean }>();

	while (!['completed', 'failed', 'expired', 'cancelled'].includes(status)) {
		const elapsed = Date.now() - startTime;

		// Check if fallback deadline reached
		if (elapsed >= FALLBACK_DEADLINE_MS) {
			console.log(`\n⚠️  Fallback deadline reached after ${Math.round(elapsed / 1000)}s!`);
			deadlineReached = true;
			break;
		}

		await sleep(POLL_INTERVAL_MS);
		batchInfo = (await makeRequest('GET', `/v1/batches/${batchResponse.id}`)) as typeof batchInfo;
		status = batchInfo.status;
		const elapsedSec = Math.round((Date.now() - startTime) / 1000);
		console.log(
			`   Status: ${status} (${batchInfo.request_counts?.completed || 0}/${batchInfo.request_counts?.total || 0} completed) [${elapsedSec}s elapsed]`
		);
	}

	if (deadlineReached) {
		// Cancel the batch
		console.log(`\n🛑 Cancelling batch ${batchResponse.id}...`);
		try {
			await makeRequest('POST', `/v1/batches/${batchResponse.id}/cancel`);
			console.log('   Batch cancellation requested');
		} catch (e) {
			console.log('   Could not cancel batch (may already be done)');
		}

		// Check if any results completed before deadline
		batchInfo = (await makeRequest('GET', `/v1/batches/${batchResponse.id}`)) as typeof batchInfo;
		if (batchInfo.output_file_id) {
			console.log('\n📥 Downloading partial results from batch...');
			const partialResults = (await makeRequest(
				'GET',
				`/v1/files/${batchInfo.output_file_id}/content`
			)) as string;

			if (partialResults && typeof partialResults === 'string' && partialResults.trim()) {
				const lines = partialResults.trim().split('\n');
				for (const line of lines) {
					const parsed = JSON.parse(line);
					const content = parsed.response?.body?.choices?.[0]?.message?.content;
					resultMap.set(parsed.custom_id, { content, fallback: false });
				}
				console.log(`   Got ${resultMap.size} results from batch`);
			}
		}

		// Find incomplete requests
		const incompleteRequests = batchRequests.filter(r => !resultMap.has(r.custom_id));
		console.log(`\n🔄 Running ${incompleteRequests.length} incomplete requests in parallel...`);

		const syncPromises = incompleteRequests.map(async (req) => {
			try {
				const syncResponse = (await makeRequest('POST', req.url, req.body)) as {
					choices?: Array<{ message?: { content?: string } }>;
				};
				const content = syncResponse.choices?.[0]?.message?.content || '';
				resultMap.set(req.custom_id, { content, fallback: true });
				console.log(`   ✅ ${req.custom_id}: ${content}`);
			} catch (e) {
				console.log(`   ❌ ${req.custom_id}: Error - ${e instanceof Error ? e.message : 'Unknown error'}`);
				resultMap.set(req.custom_id, { content: 'ERROR', fallback: true });
			}
		});

		await Promise.all(syncPromises);
	} else if (status === 'completed') {
		console.log('\n✅ Batch completed before deadline!\n');

		// Get results
		batchInfo = (await makeRequest('GET', `/v1/batches/${batchResponse.id}`)) as typeof batchInfo;
		if (!batchInfo.output_file_id) {
			throw new Error('No output file ID');
		}

		console.log('📥 Downloading results...');
		const results = (await makeRequest(
			'GET',
			`/v1/files/${batchInfo.output_file_id}/content`
		)) as string;

		const lines = results.trim().split('\n');
		for (const line of lines) {
			const parsed = JSON.parse(line);
			const content = parsed.response?.body?.choices?.[0]?.message?.content;
			resultMap.set(parsed.custom_id, { content, fallback: false });
		}
	} else {
		throw new Error(`Batch ended with status: ${status}`);
	}

	// Print final results
	console.log('\n📊 Final Results:');
	for (const req of batchRequests) {
		const result = resultMap.get(req.custom_id);
		if (result) {
			const source = result.fallback ? '(sync fallback)' : '(batch)';
			console.log(`   ${req.custom_id}: ${result.content} ${source}`);
		} else {
			console.log(`   ${req.custom_id}: No result`);
		}
	}

	console.log('\n✅ Test completed successfully!');
}

testBatch().catch((err) => {
	console.error('\n❌ Error:', err.message);
	process.exit(1);
});
