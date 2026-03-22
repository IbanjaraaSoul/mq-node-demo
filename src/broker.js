const listeners = new Map()
const queues = new Map()
const dead = new Map()
function id() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function ensure(topic) {
  if (!queues.has(topic)) queues.set(topic, [])
  if (!dead.has(topic)) dead.set(topic, [])
}
function publish(topic, payload, opts = {}) {
  ensure(topic)
  const delayMs = Number(opts.delayMs || 0)
  const priority = Number(opts.priority || 0)
  const maxRetries = Number(opts.maxRetries ?? 5)
  const msg = {
    id: id(),
    topic,
    payload,
    priority,
    attempts: 0,
    maxRetries,
    timestamp: Date.now()
  }
  const enqueue = () => {
    const q = queues.get(topic)
    q.push(msg)
    q.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp)
    dispatch(topic)
  }
  if (delayMs > 0) setTimeout(enqueue, delayMs)
  else enqueue()
  return msg.id
}
function subscribe(topic, handler, opts = {}) {
  ensure(topic)
  const key = id()
  const prefetch = Number(opts.prefetch || 1)
  listeners.set(key, { topic, handler, prefetch, inflight: 0 })
  dispatch(topic)
  return () => listeners.delete(key)
}
function dispatch(topic) {
  const q = queues.get(topic)
  if (!q || q.length === 0) return
  for (const [key, l] of listeners) {
    if (l.topic !== topic) continue
    while (q.length && l.inflight < l.prefetch) {
      const msg = q.shift()
      l.inflight++
      Promise.resolve()
        .then(() => l.handler(msg.payload, { id: msg.id, topic }))
        .then(() => {
          l.inflight--
          dispatch(topic)
        })
        .catch(() => {
          l.inflight--
          msg.attempts++
          if (msg.attempts > msg.maxRetries) {
            dead.get(topic).push(msg)
          } else {
            msg.timestamp = Date.now()
            queues.get(topic).push(msg)
          }
          dispatch(topic)
        })
    }
  }
}
function stats() {
  const topics = new Set([
    ...queues.keys(),
    ...dead.keys(),
    ...Array.from(listeners.values()).map(l => l.topic)
  ])
  const s = {}
  for (const t of topics) {
    s[t] = {
      queued: (queues.get(t) || []).length,
      dead: (dead.get(t) || []).length,
      consumers: Array.from(listeners.values()).filter(l => l.topic === t).length
    }
  }
  return s
}
export const Broker = { publish, subscribe, stats }
