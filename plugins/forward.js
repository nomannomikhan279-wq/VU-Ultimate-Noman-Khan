const { cmd } = require('../redx');
const config = require('../config');
const { isPrimaryOwner, isSudo, normalize } = require('../lib/sudo');

// 👑 Owner/Sudo message forwarder
// Reply to any message and send: .forward @923XXXXXXXXX
cmd({
    pattern: 'forward',
    alias: ['fwd'],
    desc: 'Forward a replied message/file to a user',
    category: 'owner',
    react: '📤',
    filename: __filename
}, async (conn, mek, m, { from, body, sender, reply }) => {
    const senderNumber = normalize(sender);
    const configOwners = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER : [];
    const allowed = isPrimaryOwner(sender) || isSudo(sender) || configOwners.some(n => normalize(n) === senderNumber);

    if (!allowed) return reply('🚫 This command is owner/sudo-only.');

    const quoted = m?.quoted;
    const quotedMessage = quoted?.message || quoted?.msg?.message;
    if (!quoted || !quotedMessage) {
        return reply('❌ Please reply to the message you want to forward.\n\nExample:\n.forward @923008728807');
    }

    const rawBody = String(body || '');
    const mentioned = m?.msg?.contextInfo?.mentionedJid || m?.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
    const mentionList = (Array.isArray(mentioned) ? mentioned : [mentioned])
        .filter(Boolean)
        .map(jid => normalize(jid))
        .filter(Boolean);
    const numberMatches = [...rawBody.matchAll(/@?(\d{7,15})/g)].map(x => normalize(x[1])).filter(Boolean);
    const targetNumber = mentionList[0] || numberMatches[0];

    if (!targetNumber) {
        return reply('❌ Please mention the user or provide their number.\n\nExample:\n.forward @923008728807');
    }
    if (targetNumber.length < 7 || targetNumber.length > 15) return reply('❌ Invalid WhatsApp number.');

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    try {
        // Prefer the socket's built-in copyNForward helper when available.
        // This preserves the original message type and forwarded-message metadata.
        if (typeof conn.copyNForward === 'function') {
            await conn.copyNForward(targetJid, quoted, true);
        } else {
            const key = quoted.key || {
                remoteJid: quoted.chat || from,
                id: quoted.id || quoted.stanzaId,
                participant: quoted.participant,
                fromMe: Boolean(quoted.fromMe)
            };
            const { generateForwardMessageContent, generateWAMessageFromContent } = require('@whiskeysockets/baileys');
            const forwardContent = await generateForwardMessageContent({ key, message: quotedMessage }, true);
            const generated = generateWAMessageFromContent(targetJid, forwardContent, {
                userJid: conn.user?.id,
                upload: conn.waUploadToServer
            });
            await conn.relayMessage(targetJid, generated.message, { messageId: generated.key.id });
        }

        return reply(`✅ Message forwarded successfully to @${targetNumber}`, from, { mentions: [targetJid] });
    } catch (error) {
        console.error('[Forward] Error:', error);
        return reply(`❌ Failed to forward the message.\n\n${error?.message || 'Unknown forwarding error.'}`);
    }
});
