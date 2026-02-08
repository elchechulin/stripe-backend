// lib/paymentTokens.js

const paymentTokens = new Map();

export function savePaymentToken(token, data) {
  paymentTokens.set(token, {
    ...data,
    createdAt: Date.now()
  });
}

export function getPaymentToken(token) {
  return paymentTokens.get(token);
}

export function deletePaymentToken(token) {
  paymentTokens.delete(token);
}
