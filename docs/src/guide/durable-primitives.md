# Durable Primitives

This guide introduces Flowcraft's durable primitives - a set of built-in functions that enable workflows to pause and resume based on time, external events, and webhook calls. These primitives work seamlessly with the Flowcraft compiler to transform imperative code into durable, resumable workflows.

## Overview

Durable primitives provide a high-level API for common long-running workflow patterns:

- **`sleep()`**: Pause execution for a specified duration
- **`waitForEvent()`**: Wait for external events or signals
- **`createWebhook()`**: Create webhook endpoints for external integrations

These primitives are designed to work with the Flowcraft compiler, which automatically transforms them into the appropriate runtime nodes.

## `sleep()`

The `sleep()` primitive pauses workflow execution for a specified duration and automatically resumes when the timer expires.

### Basic Usage

```typescript
import { sleep } from 'flowcraft/sdk'

/** @flow */
export async function delayedWorkflow() {
  console.log('Starting workflow...')

  // Sleep for 5 minutes
  await sleep('5m')

  console.log('Workflow resumed after 5 minutes')
  return { status: 'completed' }
}
```

### Runtime Requirements

When running flows in-memory, the `FlowRuntime`'s internal scheduler must be started via `runtime.startScheduler()` for `sleep` to function. In a distributed environment, this primitive relies on the adapter's underlying message queue to provide a 'delayed delivery' feature.

### Compiler Transformation

The compiler transforms `await sleep('5m')` into a `sleep` node:

```typescript
// Generated blueprint
{
  nodes: [
    {
      id: 'sleep_1',
      uses: 'sleep',
      params: { duration: '5m' }
    }
  ]
}
```

## `waitForEvent()`

The `waitForEvent()` primitive pauses workflow execution until an external event is received. This enables event-driven workflows that respond to external signals, user interactions, or system notifications.

### Basic Usage

```typescript
import { waitForEvent } from 'flowcraft/sdk'

interface EventData {
  userId: string
  action: string
  timestamp: string
}

/** @flow */
export async function eventDrivenWorkflow() {
  console.log('Waiting for user action...')

  // Wait for a specific event
  const eventData = await waitForEvent<EventData>('user_action')

  console.log(`Received event: ${eventData.action} from user ${eventData.userId}`)
  return { eventData }
}
```

### Event Types

Events can be any structured data:

```typescript
/** @flow */
export async function multiEventWorkflow() {
  // Wait for approval event
  const approval = await waitForEvent<{ approved: boolean; reviewer: string }>('approval')

  if (approval.approved) {
    // Wait for payment event
    const payment = await waitForEvent<{ amount: number; method: string }>('payment_processed')

    return { status: 'paid', payment }
  } else {
    return { status: 'rejected', reason: 'not approved' }
  }
}
```

### Compiler Transformation

The compiler transforms `await waitForEvent('event_name')` into a `wait` node:

```typescript
// Generated blueprint
{
  nodes: [
    {
      id: 'wait_1',
      uses: 'wait',
      params: { eventName: 'user_action' }
    }
  ]
}
```

### Runtime Resumption

To resume a workflow waiting for an event, use the runtime's `resume()` method:

```typescript
import { FlowRuntime } from 'flowcraft'

// Run the workflow (it will pause at waitForEvent)
const runtime = new FlowRuntime()
const result = await runtime.run(blueprint, {}, { functionRegistry })

if (result.status === 'awaiting') {
  // Resume with event data
  const finalResult = await runtime.resume(
    blueprint,
    result.serializedContext,
    { userId: '123', action: 'approve', timestamp: new Date().toISOString() }
  )
}
```

## `createWebhook()`

The `createWebhook()` primitive creates a webhook endpoint that external systems can call. The workflow pauses until the webhook is invoked, then resumes with the request data.

### Basic Usage

```typescript
import { createWebhook } from 'flowcraft/sdk'

interface WebhookPayload {
  event: string
  data: any
}

/** @flow */
export async function webhookWorkflow() {
  console.log('Creating webhook endpoint...')

  // Create webhook
  const webhook = await createWebhook<WebhookPayload>()

  console.log(`Webhook URL: ${webhook.url}`)
  console.log(`Event name: ${webhook.event}`)

  // Wait for webhook call
  const { request } = await webhook.request
  const payload = await request.json()

  console.log('Received webhook:', payload)
  return { payload }
}
```

### Webhook Object

The `createWebhook()` method returns a webhook object with:

- **`url`**: The public URL that external systems should POST to
- **`event`**: A unique event name for internal routing
- **`request`**: A promise that resolves when the webhook is called

### Request Handling

The `webhook.request` promise resolves to an object with methods to access the HTTP request:

```typescript
/** @flow */
export async function advancedWebhook() {
  const webhook = await createWebhook()

  const { request } = await webhook.request

  // Access request data
  const jsonData = await request.json()
  const textData = await request.text()
  const headers = request.headers

  return { jsonData, textData, headers }
}
```

### Compiler Transformation

The compiler transforms webhook creation and usage into multiple nodes:

```typescript
// await createWebhook() becomes:
{
  id: 'webhook_1',
  uses: 'webhook'
}

// await webhook.request becomes:
{
  id: 'wait_for_webhook_1',
  uses: 'wait',
  params: { eventName: 'webhook:webhook_1' }
}
```

## Complete Example

Here's a comprehensive example combining all three primitives:

```typescript
import { sleep, waitForEvent, createWebhook } from 'flowcraft/sdk'

interface PaymentEvent {
  orderId: string
  amount: number
  status: 'success' | 'failed'
}

interface WebhookNotification {
  type: 'payment' | 'refund'
  orderId: string
  details: any
}

/** @flow */
export async function orderProcessingWorkflow(orderId: string) {
  console.log(`Processing order ${orderId}`)

  // Step 1: Wait for payment event
  const payment = await waitForEvent<PaymentEvent>('payment_completed')
  if (payment.status === 'failed') {
    return { status: 'failed', reason: 'payment failed' }
  }

  // Step 2: Create webhook for external notifications
  const webhook = await createWebhook<WebhookNotification>()

  // Send webhook URL to external system
  await notifyExternalSystem(webhook.url, orderId)

  // Step 3: Sleep briefly to allow external processing
  await sleep('30s')

  // Step 4: Wait for webhook confirmation
  const { request } = await webhook.request
  const notification = await request.json()

  if (notification.type === 'refund') {
    return { status: 'refunded', notification }
  }

  return {
    status: 'completed',
    orderId,
    payment,
    notification
  }
}
```

## Runtime Behavior

### Workflow States

Durable primitives create workflows that can be in different states:

- **`running`**: Actively executing nodes
- **`awaiting`**: Paused at a durable primitive, waiting for external input
- **`completed`**: Finished execution successfully
- **`failed`**: Encountered an error

### Automatic Resumption

- **Sleep nodes**: Automatically resume when the timer expires
- **Wait nodes**: Require manual resumption via `runtime.resume()`
- **Webhook nodes**: Resume when the webhook endpoint receives a POST request

### State Persistence

All awaiting workflows maintain their complete state in the serialized context, enabling:

- **Durability**: Workflows survive system restarts
- **Scalability**: Workflows can be resumed on different machines
- **Observability**: Current state and progress are always available

## Best Practices

1. **Use Appropriate Timeouts**: Combine sleep with wait nodes for escalation patterns
2. **Handle Webhook Failures**: Implement retry logic for webhook-dependent workflows
3. **Validate Event Data**: Always validate incoming event and webhook data
4. **Monitor Awaiting Workflows**: Track workflows in awaiting state for observability
5. **Use TypeScript Types**: Strongly type your event and webhook payloads
6. **Combine Primitives**: Mix sleep, wait, and webhook primitives for complex workflows
7. **Error Handling**: Implement proper error handling for resumed workflows

## Integration with Adapters

When using distributed adapters (BullMQ, SQS, etc.), durable primitives work seamlessly:

- **Sleep nodes**: Handled by the adapter's timer system
- **Wait nodes**: Events are published to the adapter's event system
- **Webhook nodes**: Endpoints are registered with the adapter's webhook system

See the [Distributed Execution](/guide/distributed-execution) guide for more details on adapter-specific behavior.
