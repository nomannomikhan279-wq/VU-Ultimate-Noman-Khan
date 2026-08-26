const { cmd } = require('../redx');
const config = require('../config');
const {
    generateForwardMessageContent,
    generateWAMessageFromContent
} = require('@whiskeysockets/baileys');

// 👑 Owner/Sudo message forwarder
// Reply to any message/file/image and send: .forward @923XXXXXXXXX
cmd({
    pattern: 'forward',
    alias: ['fwd'],
    desc: 'Forward a replied message/file to a user',
    category: 'owner',
    react: '📤',
    filename: __filename
}, async (conn, mek, m, { from, body, sender, isOwner, reply }) => {
    const normalize = (number) => {
        let n = String(number || '').replace(/[^0-9]/g, '');
        if (n.startsWith('00')) n = n.slice(2);
        if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
        return n;
    };

    const ownerNumbers = Array.isArray(config.OWNER_NUMBER) ? config.OWNER_NUMBER : [];
    const senderNumber = normalize(sender);
    const ownerByNumber = ownerNumbers.some(number => normalize(number) === senderNumber);

    if (!isOwner && !ownerByNumber) {
        return reply('🚫 This command is owner-only.');
    }

    if (!m.quoted || !m.quoted.message) {
        return reply('❌ Please reply to a message, image, video, document, audio or sticker.\n\nExample:\n.forward @923008728807');
    }

    const rawBody = String(body || '');
    const numbers = [...rawBody.matchAll(/@?(\d{7,15})/g)].map(match => match[1]);

    const mentioned = m.msg?.contextInfo?.mentionedJid || [];
    const mentionedList = (Array.isArray(mentioned) ? mentioned : [mentioned])
        .filter(Boolean)
        .map(jid => String(jid).split(':')[0].split('@')[0].replace(/[^0-9]/g, ''))
        .filter(Boolean);

    const targetNumber = mentionedList[0] || numbers[0];

    if (!targetNumber) {
        return reply('❌ Please mention the user you want to send this to.\n\nExample:\n.forward @923008728807');
    }

    if (targetNumber.length < 7 || targetNumber.length > 15) {
        return reply('❌ Invalid WhatsApp number.');
    }

    const targetJid = `${targetNumber}@s.whatsapp.net`;

    try {
        // Use Baileys' official forward-message generation instead of manually
        // rebuilding the message key. The previous implementation could report
        // success while WhatsApp silently rejected the malformed forwarded key.
        const originalMessage = {
            key: m.quoted.key || {
                remoteJid: m.quoted.chat || from,
                id: m.quoted.id || m.quoted.stanzaId,
                participant: m.quoted.participant,
                fromMe: false
            },
            message: m.quoted.message
        };

        const forwardContent = await generateForwardMessageContent(originalMessage, true);
        const forwardMessage = generateWAMessageFromContent(targetJid, forwardContent, {
            userJid: conn.user?.id,
            upload: conn.waUploadToServer
        });

        await conn.relayMessage(targetJid, forwardMessage.message, {
            messageId: forwardMessage.key.id
        });

        return reply(`✅ Message forwarded successfully to @${targetNumber}`, from, {
            mentions: [targetJid]
        });
    } catch (error) {
        console.error('[Forward] Error:', error);
        return reply(`❌ Failed to forward the message.\n\n${error?.message || 'Unknown forwarding error.'}`);
    }
});
