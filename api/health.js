import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

export const config = {
  api: {
    bodyParser: false
  },
  runtime: "nodejs"
};

const sql = neon(process.env.DATABASE_URL);
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on("data", (chunk) => chunks.push(chunk));
    readable.on("end", () => resolve(Buffer.concat(chunks)));
    readable.on("error", reject);
  });
}

export default async function handler(req, res) {

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Stripe-Signature");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // HEALTH CHECK
  if (req.method === "GET") {
    return res.status(200).json({ ok: true });
  }

  // WEBHOOK STRIPE
  if (req.headers["stripe-signature"]) {

    let event;

    try {
      const rawBody = await buffer(req);
      const signature = req.headers["stripe-signature"];

      event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );

    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // IGNORAR TEST MODE
    if (!event.livemode) {
      return res.status(200).json({ ignored: "test mode" });
    }

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;

      if (session.payment_status === "paid") {

        const metadata = session.metadata || {};

        try {
          const price = session.amount_total / 100;

let service_type = null;

if (price <= 100) {
  service_type = "low";
} else if (price <= 300) {
  service_type = "medium";
} else {
  service_type = "high";
}

await sql`
  INSERT INTO sales_history (
    closer_id,
    client_id,
    monthly_price,
    service_type,
    commission_percentage,
    subscription_status,
    created_at
  )
  VALUES (
    ${metadata.closer_id || null},
    ${metadata.client_id || null},
    ${price},
    ${service_type},
    ${metadata.commission_percentage || 0},
    'active',
    NOW()
  )
`;
        } catch (dbError) {
          console.error("DB insert error:", dbError);
        }
      }
    }

    return res.status(200).json({ received: true });
  }

  // PRESENCE
  if (req.method === "POST") {

    let body = "";

    try {
      const raw = await buffer(req);
      body = JSON.parse(raw.toString());
    } catch {
      return res.status(400).json({ error: "Body inválido" });
    }

    const { user_id } = body;

    if (!user_id) {
      return res.status(400).json({ error: "user_id requerido" });
    }

    try {
      await sql`
        INSERT INTO presence (user_id, last_seen)
        VALUES (${user_id}, NOW())
        ON CONFLICT (user_id)
        DO UPDATE SET last_seen = NOW()
      `;
    } catch (err) {
      console.error("Presence error:", err);
    }

    return res.status(200).json({ updated: true });
  }

  return res.status(405).json({ error: "Método no permitido" });
}
