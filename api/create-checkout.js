import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { modo, mensualidad, setup } = req.body;

    if (!mensualidad) {
      return res.status(400).json({ error: "Missing mensualidad" });
    }

    const lineItems = [];

    lineItems.push({
      price_data: {
        currency: "eur",
        product_data: {
          name: "Servicio mensual",
        },
        unit_amount: mensualidad * 100, // 🔴 EN CÉNTIMOS
        recurring: { interval: "month" },
      },
      quantity: 1,
    });

    if (modo === "setup" && setup) {
      lineItems.push({
        price_data: {
          currency: "eur",
          product_data: {
            name: "Setup inicial",
          },
          unit_amount: setup * 100,
        },
        quantity: 1,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: lineItems,
      success_url: "https://pricing-restaurantes.vercel.app/?success=1",
      cancel_url: "https://pricing-restaurantes.vercel.app/?cancel=1",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("STRIPE ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
