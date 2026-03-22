import { connect, JSONCodec, AckPolicy, StorageType } from "nats"

const STREAM = "MQ_DEMO"
const DURABLE = "bruno-http"

/**
 * JetStream-backed queue demo: stream `MQ_DEMO` captures subjects `demo.>`.
 * Durable pull consumer `bruno-http` lets HTTP `GET /nats/consume` fetch + ack messages.
 */
export async function initNats() {
  const servers = process.env.NATS_URL || "nats://127.0.0.1:4222"
  let nc
  try {
    nc = await connect({ servers })
  } catch (e) {
    console.warn("[nats] connect failed:", e.message)
    return null
  }

  const jsm = await nc.jetstreamManager()
  const js = nc.jetstream()
  const jc = JSONCodec()

  try {
    await jsm.streams.info(STREAM)
  } catch {
    await jsm.streams.add({
      name: STREAM,
      subjects: ["demo.>"],
      storage: StorageType.Memory
    })
  }

  try {
    await jsm.consumers.info(STREAM, DURABLE)
  } catch {
    await jsm.consumers.add(STREAM, {
      durable_name: DURABLE,
      filter_subject: "demo.>",
      ack_policy: AckPolicy.Explicit
    })
  }

  console.log(`[nats] JetStream stream "${STREAM}", durable pull consumer "${DURABLE}" (subjects demo.>)`)

  return { nc, js, jsm, jc, STREAM, DURABLE }
}

function unavailable(res) {
  res.status(503).json({
    error: "NATS not connected",
    hint: "Run NATS with JetStream: docker compose up -d   (then restart: npm start). Default NATS_URL=nats://127.0.0.1:4222"
  })
}

export function attachNatsRoutes(app, ctx) {
  app.get("/nats/health", async (req, res) => {
    if (!ctx) return unavailable(res)
    try {
      const si = await ctx.jsm.streams.info(ctx.STREAM)
      const ci = await ctx.jsm.consumers.info(ctx.STREAM, ctx.DURABLE)
      const lost = si.state.lost
      const lostMessages = Array.isArray(lost?.msgs) ? lost.msgs.length : 0
      res.json({
        ok: true,
        stream: ctx.STREAM,
        messages: si.state.messages,
        consumer: ctx.DURABLE,
        pending: ci.num_pending,
        deadLetter: {
          note: "JetStream has no single DLQ bucket; these are the closest built-in signals.",
          stream: {
            deleted: si.state.num_deleted,
            lostMessages,
            lostBytes: lost?.bytes ?? 0
          },
          consumer: {
            redelivered: ci.num_redelivered,
            ackPending: ci.num_ack_pending
          }
        }
      })
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) })
    }
  })

  app.post("/nats/publish", async (req, res) => {
    if (!ctx) return unavailable(res)
    const { subject, data } = req.body || {}
    if (!subject || typeof subject !== "string") {
      return res.status(400).json({ error: "subject required (e.g. demo.orders)" })
    }
    if (!subject.startsWith("demo.")) {
      return res.status(400).json({
        error: "subject must be under demo.* (stream binds demo.>)",
        example: "demo.orders"
      })
    }
    try {
      const pa = await ctx.js.publish(subject, ctx.jc.encode(data ?? {}))
      res.json({
        stream: pa.stream,
        sequence: pa.seq,
        duplicate: pa.duplicate
      })
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) })
    }
  })

  app.get("/nats/consume", async (req, res) => {
    if (!ctx) return unavailable(res)
    const batch = Math.min(50, Math.max(1, Number(req.query.batch) || 5))
    const expires_ms = Math.min(60_000, Math.max(100, Number(req.query.expires_ms) || 3000))
    try {
      const iter = await ctx.js.fetch(ctx.STREAM, ctx.DURABLE, {
        batch,
        expires: expires_ms
      })
      const messages = []
      for await (const m of iter) {
        let payload
        try {
          payload = ctx.jc.decode(m.data)
        } catch {
          payload = { _raw: "[non-json payload]" }
        }
        messages.push({
          subject: m.subject,
          sequence: m.seq,
          payload
        })
        m.ack()
      }
      res.json({ count: messages.length, messages })
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) })
    }
  })
}
