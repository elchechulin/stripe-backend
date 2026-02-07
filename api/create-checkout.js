import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // 🔹 CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // 🔹 Preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { modo, mensualidad, setup } = req.body;
    
    // 🔒 Validación obligatoria para modo setup
if (modo === "setup" && !setup) {
  return res.status(400).json({
    error: "Missing setup amount for setup mode"
  });
}

    if (!mensualidad) {
      return res.status(400).json({ error: "Missing mensualidad" });
    }

  

    const now = Math.floor(Date.now() / 1000);

// anclar la suscripción al mes siguiente
const nextMonth = now + 30 * 24 * 60 * 60;

const session = await stripe.checkout.sessions.create({
  mode: "subscription",
  payment_method_types: ["card"],

  line_items: [
    {
      price_data: {
        currency: "eur",
        product_data: { name: "Servicio mensual" },
        unit_amount: mensualidad * 100,
        recurring: { interval: "month" }
      },
      quantity: 1
    }
  ],

  subscription_data: modo === "setup" && setup
  ? {
        billing_cycle_anchor: nextMonth,
        proration_behavior: "none",
        invoice_items: [
          {
            price_data: {
              currency: "eur",
              product_data: { name: "Setup inicial" },
              unit_amount: setup * 100
            }
          }
        ]
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
