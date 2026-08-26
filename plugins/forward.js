const { cmd } = require('../redx');

// 👑 Owner-only message/file forwarder
// Usage: reply to any message/file/image and send: .forward @923XXXXXXXXX
cmd({
    pattern: 'forward',
    alias: ['fwd'],
    desc: 'Forward a replied message/file to a user',
    category: 'owner',
    react: '📤',
    filename: __filename
}, async (conn, mek, m, { from, body, isOwner, reply }) => {
    if (!isOwner) {
        return reply('🚫 This command is owner-only.');
    }

    if (!m.quoted || !m.quoted.message) {
        return reply('❌ Please reply to a message, image, video, document, audio or sticker.\n\nExample:\n.forward @923008872807');
    }

    const rawBody = String(body || '');
    const numbers = [...rawBody.matchAll(/@?(\d{7,15})/g)].map(match => match[1]);

    // Prefer WhatsApp's actual mention metadata when available.
    const mentioned = m.msg?.contextInfo?.mentionedJid || [];
    const mentionedList = (Array.isArray(mentioned) ? mentioned : [mentioned])
        .filter(Boolean)
        .map(jid => String(jid).split(':')[0].split('@')[0].replace(/[^0-9]/g, ''))
        .filter(Boolean);

    const targetNumber = mentionedList[0] || numbers[0];

    if (!targetNumber) {
        return reply('❌ Please mention the user you want to send this to.\n\nExample:\n.forward @923008872807');
    }

    // Avoid accidentally forwarding to an invalid/broadcast-style destination.
    if (targetNumber.length < 7 || targetNumber.length > 15) {
        return reply('❌ Invalid WhatsApp number.');
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    try {
        // Build the minimum WAMessage object expected by Baileys' forward helper.
        // The original quoted message content is kept intact, so images, videos,
        // documents, audio, stickers and normal text can all be forwarded.
        const quotedMessage = {
            key: {
                remoteJid: from,
                id: m.quoted.stanzaId || `FORWARD_${Date.now()}`,
                fromMe: false,
                participant: m.quoted.participant || undefined
            },
            message: m.quoted.message
        };

        await conn.sendMessage(targetJid, {
            forward: quotedMessage,
            force: true
        });

        return reply(`✅ Message forwarded successfully to @${targetNumber}`, {
            mentions: [targetJid]
        });
    } catch (error) {
        console.error('[Forward] Error:', error);
        return reply('❌ Failed to forward the message. Please try again.');
    }
});
