# n8n-nodes-openai-batch

An n8n community node for executing batch requests to OpenAI's Batch API. This node allows you to process multiple requests at once with 50% cost savings compared to synchronous API calls.

## Features

- **Chat Completions** - Batch process multiple chat completion requests
- **Embeddings** - Batch generate embeddings for multiple texts
- **Automatic polling** - Waits for batch completion and returns results
- **Cost effective** - OpenAI Batch API offers 50% discount vs synchronous requests

## Installation

### In n8n

1. Go to **Settings > Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-openai-batch`
4. Click **Install**

### Manual Installation

```bash
# In your n8n installation directory
npm install n8n-nodes-openai-batch
```

## Setup

1. Create OpenAI API credentials in n8n:
   - Go to **Credentials > New**
   - Search for **OpenAI API**
   - Enter your API key from [OpenAI Platform](https://platform.openai.com/api-keys)

## Usage

### Chat Completions

1. Add the **OpenAI Batch** node to your workflow
2. Select **Chat Completion** operation
3. Choose your model (e.g., `gpt-4o-mini`)
4. Configure messages using expressions to reference input data:
   - Role: `user`
   - Content: `{{ $json.prompt }}` (or your input field)

### Embeddings

1. Add the **OpenAI Batch** node to your workflow
2. Select **Embeddings** operation
3. Choose embedding model (e.g., `text-embedding-3-small`)
4. Set input text using expression: `{{ $json.text }}`

### Options

| Option | Description | Default |
|--------|-------------|---------|
| Max Tokens | Maximum tokens to generate (chat only) | 1000 |
| Temperature | Controls randomness (0-2) | 1 |
| Polling Interval | Seconds between status checks | 30 |
| Timeout | Maximum wait time in minutes | 1440 (24h) |
| Metadata | Custom JSON metadata for the batch | {} |

## Output

Each input item receives corresponding output with:

- `response` - The generated text (chat) or embedding array
- `fullResponse` - Complete API response
- `batchId` - OpenAI batch ID for reference
- `customId` - Request identifier

## Example Workflow

```
[Read CSV] → [OpenAI Batch] → [Write Results]
```

Input items with a `prompt` field will be batched and processed together.

## Development

```bash
# Install dependencies
npm install

# Run tests (requires .env with OPENAI_API_KEY)
npm test

# Build
npm run build
```

## License

MIT
