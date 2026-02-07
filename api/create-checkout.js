import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body = "";

  try {
    for await (const chunk of req) {
      body += chunk;
    }
    body = JSON.parse(body);
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { modo, mensualidad, setup } = body;

  if (!mensualidad || mensualidad <= 0) {
    return res.status(400).json({ error: "Mensualidad inválida" });
  }

  try {
    const lineItems = [
      {
        price_data: {
          currency: "eur",
          product_data: {
            name:
              modo === "setup"
                ? "Servicio mensual + setup"
                : "Servicio mensual",
          },
          unit_amount: mensualidad * 100,
          recurring: { interval: "month" },
        },
        quantity: 1,
      },
    ];

    if (modo === "setup" && setup > 0) {
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
      success_url: "https://pricing-restaurantes.vercel.app/pago-inmediato.html",
      cancel_url: "https://pricing-restaurantes.vercel.app/",
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: "Stripe error" });
  }
}
