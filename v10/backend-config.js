/**
 * Backend Configuration for Zara Aura Lite
 *
 * After deploying aura-lite-backend to Render / Railway / any host:
 *  1. Replace the url below with your deployed backend URL
 *  2. Replace adminSecret with the value of ADMIN_SECRET from your .env file
 *
 * Leave url as empty string '' to run the app without backend
 * (forgot-password OTP will fall back to WhatsApp, order confirmations via WhatsApp).
 */
var backendConfig = {
  url:         '',   // e.g. 'https://aura-lite-backend.onrender.com'
  adminSecret: '',   // must match ADMIN_SECRET in your backend .env
};
