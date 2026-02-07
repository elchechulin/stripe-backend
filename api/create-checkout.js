import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { modo, mensualidad, setup } = req.body;

    if (!mensualidad) {
      return res.status(400).json({ error: "Missing mensualidad" });
    }

    if (modo === "setup" && (!setup || setup <= 0)) {
      return res.status(400).json({ error: "Missing or invalid setup" });
    }

    const now = Math.floor(Date.now() / 1000);
    const nextMonth = now + 30 * 24 * 60 * 60;

    const lineItems = [];

    // 🔹 SETUP: pago único
    if (modo === "setup") {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: { name: "Setup inicial" },
          unit_amount: setup * 100
        },
        quantity: 1
      });
    }

    // 🔹 MENSUALIDAD: suscripción
    lineItems.push({
      price_data: {
        currency: "eur",
        product_data: { name: "Servicio mensual" },
        unit_amount: mensualidad * 100,
        recurring: { interval: "month" }
      },
      quantity: 1
    });

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      subscription_data:
        modo === "setup"
          ? {
              billing_cycle_anchor: nextMonth,
              proration_behavior: "none"
            }
          : undefined,
      success_url: "https://pricing-restaurantes.vercel.app/?success=1",
      cancel_url: "https://pricing-restaurantes.vercel.app/?cancel=1"
    });

    return res.status(200).json({ url: session.url });

  } catch (err) {
    console.error("STRIPE ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
