import express from "express"
import { Broker } from "./broker.js"
import { Consumers } from "./consumers.js"
import { initNats, attachNatsRoutes } from "./natsIntegration.js"

const app = express()
app.use(express.json())
Consumers.register()

const nats = await initNats()
attachNatsRoutes(app, nats)

app.get("/", (req, res) => {
  res.json({
    name: "mq-node-demo",
    docs: {
      inMemoryBroker: {
        enqueue: "POST /send { topic, payload, delayMs?, priority?, maxRetries? }",
        stats: "GET /stats"
      },
      natsJetStream: {
        health: "GET /nats/health",
        publish: "POST /nats/publish { subject, data }",
        consume: "GET /nats/consume?batch=5&expires_ms=3000"
      }
    }
  })
})
app.get("/stats", (req, res) => {
  res.json(Broker.stats())
})
app.post("/send", (req, res) => {
  const { topic, payload, delayMs, priority, maxRetries } = req.body || {}
  if (!topic) return res.status(400).json({ error: "topic required" })
  const id = Broker.publish(topic, payload ?? {}, { delayMs, priority, maxRetries })
  res.json({ id })
})
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}/`)
})
