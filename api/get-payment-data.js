import crypto from "crypto";

const SECRET = process.env.PAYMENT_TOKEN_SECRET;

if (!SECRET) {
  console.error("❌ PAYMENT_TOKEN_SECRET is missing");
  return res.status(500).json({
    error: "Server misconfiguration: missing PAYMENT_TOKEN_SECRET"
  });
}

export default function handler(req, res) {
  const { token } = req.query;

  if (!token) {
    return res.status(400).json({ error: "Missing token" });
  }

  const [payloadB64, signature] = token.split(".");

  const expectedSignature = crypto
    .createHmac("sha256", SECRET)
    .update(payloadB64)
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(403).json({ error: "Invalid token" });
  }

  const payload = JSON.parse(
    Buffer.from(payloadB64, "base64url").toString()
  );

  if (Date.now() > payload.exp) {
    return res.status(410).json({ error: "Token expired" });
  }

  return res.status(200).json({
    mensualidad: payload.mensualidad,
    setup: payload.setup
  });
}
