'use strict';

const axios = require('axios');

const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const API_URL = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

/**
 * Send a text message via Meta WhatsApp Cloud API.
 */
async function sendMessage(toJid, text) {
  // toJid may be a raw phone number like 254XXXXXXXXX or full JID
  const to = toJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  try {
    await axios.post(API_URL, {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }, {
      headers: {
        Authorization: `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    console.log(`[SENT] to=${to} text="${text.substring(0, 60)}..."`);
  } catch (e) {
    const detail = e.response?.data ? JSON.stringify(e.response.data) : e.message;
    console.error(`[SEND ERROR] to=${to}: ${detail}`);
    throw e;
  }
}

module.exports = { sendMessage };
