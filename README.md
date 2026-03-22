# Node.js In-Memory Message Queue Demo

A demonstration of message queue (MQ) concepts using a custom in-memory broker in Node.js. Implements Producers, Consumers, and Brokers with support for priorities, retries, and dead-letter queues.

## Quick Start

```bash
npm install
npm start          # Start server at http://localhost:3000
npm run demo       # Run demo in another terminal
```

## Concepts

- **Producer**: Sends messages to a topic
- **Consumer**: Listens to a topic and processes messages
- **Broker**: Buffers and routes messages with support for:
  - Per-topic queues
  - Dead Letter Queue (DLQ) for failed messages
  - Automatic retry with configurable attempts
  - Priority-based processing

## Installation

```bash
npm install
```

## Running

**Start the server:**
```bash
npm start
```
Server runs at `http://localhost:3000`.

**Run the demo:**
```bash
npm run demo
```
Shows happy path, failures, retries → DLQ, and stats.

## NATS JetStream (Production Queue)

The in-memory demo is a teaching tool. For production-style messaging, NATS JetStream provides persistent streams and durable consumers.

1. Start NATS: `npm run nats:up` or `docker compose up -d`
2. Start API: `npm start` (uses `NATS_URL`, default `nats://127.0.0.1:4222`)
3. Use Bruno to test:
   - **NATS - Health**: Check stream/consumer status
   - **NATS - Publish**: POST to `/nats/publish` with subject `demo.orders`
   - **NATS - Consume**: GET `/nats/consume` to pull and acknowledge messages

If NATS is unavailable, `/nats/*` returns 503 but the rest of the app works.

| File | Purpose |
|------|---------|
| `docker-compose.yml` | NATS server with JetStream on port 4222 |
| `src/natsIntegration.js` | Creates stream `MQ_DEMO`, durable consumer `bruno-http` |

## API

### POST /send

Send a message to a topic.

| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Channel name (e.g., "emails", "payments") |
| payload | object | Message data |
| priority | number | Higher = processed first (default: 0) |
| maxRetries | number | Attempts before DLQ (default: 5) |
| delayMs | number | Delay before processing (default: 0) |

**Examples:**

```bash
# Email task
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"topic": "emails", "payload": {"to": "user@example.com", "subject": "Hello!"}, "priority": 10}'

# Payment task (amount <= 0 fails)
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"topic": "payments", "payload": {"amount": 50}}'

# Failing task (tests retry → DLQ)
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"topic": "emails", "payload": {"fail": true}, "maxRetries": 2}'
```

### GET /stats

View queue state, consumer status, and dead-letter counts.

## How It Works

1. **Enqueue**: `POST /send` adds message to topic queue
2. **Process**: Consumers poll their topics and handle messages
3. **Outcome**:
   - Success: message removed from queue
   - Failure: retry up to `maxRetries`, then move to DLQ

## Testing

```bash
# Happy path
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"topic": "emails", "payload": {"to": "test@example.com", "subject": "Hi"}}'

# Watch retries → DLQ
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -d '{"topic": "emails", "payload": {"fail": true}, "maxRetries": 2}'

# Check queue state
curl http://localhost:3000/stats
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| PORT | 3000 | Server port |
| NATS_URL | nats://127.0.0.1:4222 | NATS server URL |

## Project Structure

| File | Description |
|------|-------------|
| `src/server.js` | HTTP API entry point (`/send`, `/stats`, `/nats/*`) |
| `src/broker.js` | `MessageBroker` class - queue management, routing, retries |
| `src/consumers.js` | Worker functions: `emailWorker`, `paymentWorker` |
| `src/natsIntegration.js` | NATS JetStream stream and consumer setup |
