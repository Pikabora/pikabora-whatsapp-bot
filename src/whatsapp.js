'use strict';

const { Boom } = require('@hapi/boom');
const pino = require('pino');

const AUTH_DIR = process.env.PIKABORA_AUTH_DIR || './auth_state';

/**
 * Connects to WhatsApp and calls onMessage(fromJid, text) for every inbound
 * text message. Returns the socket so index.js can call sock.sendMessage.
 *
 * NOT TESTED LIVE in this build -- Baileys authenticates by scanning a QR
 * code with a real WhatsApp account, which this sandboxed environment can't
 * do. Everything upstream of this file (conversation.js, reviewQueue.js,
 * backendClient.js) is tested against the real backend; this file is
 * standard Baileys boilerplate that has not itself been run against a live
 * connection. Say so plainly when this gets deployed, don't assume it "just
 * works" because the rest of the pipeline does.
 */
async function connect(onMessage) {
  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = await import('@whiskeysockets/baileys');

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'warn' }),
    printQRInTerminal: true,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect } = update;
    if (connection === 'close') {
      const shouldReconnect = new Boom(lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) connect(onMessage);
    } else if (connection === 'open') {
      console.log('WhatsApp connection open.');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        '';
      if (!text) continue;
      await onMessage(msg.key.remoteJid, text, sock);
    }
  });

  return sock;
}

module.exports = { connect };
