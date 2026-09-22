'use strict';

const { createWebhookApp } = require('./src/webhook');

const PORT = process.env.PORT || 3000;

const app = createWebhookApp();
app.listen(PORT, () => {
  console.log(`Pikabora WhatsApp Bot webhook server running on port ${PORT}`);
  console.log(`Webhook URL: https://pikabora-whatsapp-bot.onrender.com/webhook`);
  console.log(`Health check: https://pikabora-whatsapp-bot.onrender.com/health`);
});

module.exports = app;
