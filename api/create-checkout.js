import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { amount, description } = req.body;

    if (!amount || amount < 1) {
      return res.status(400).json({ error: "Invalid amount" });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: description || "Servicio Restaurant Marketing",
            },
            unit_amount: Math.round(amount * 100), // euros → céntimos
          },
          quantity: 1,
        },
      ],
      success_url: "https://www.mesasllenas.com/pago-exito.html",
      cancel_url: "https://www.mesasllenas.com/pago-cancelado.html",
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    return res.status(500).json({ error: "Stripe session failed" });
  }
}
