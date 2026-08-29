const {
    proto,
    getContentType,
    jidNormalizedUser,
    downloadContentFromMessage
} = require('@whiskeysockets/baileys');

const getText = (message, type) => {
    if (!message) return '';
    if (type === 'conversation') return message.conversation || '';
    if (type === 'extendedTextMessage') return message.extendedTextMessage?.text || '';
    if (type === 'imageMessage') return message.imageMessage?.caption || '';
    if (type === 'videoMessage') return message.videoMessage?.caption || '';
    if (type === 'buttonsResponseMessage') return message.buttonsResponseMessage?.selectedButtonId || '';
    if (type === 'listResponseMessage') return message.listResponseMessage?.singleSelectReply?.selectedRowId || '';
    if (type === 'templateButtonReplyMessage') return message.templateButtonReplyMessage?.selectedId || '';
    if (type === 'interactiveResponseMessage') {
        try {
            const json = message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            if (json) {
                const p = JSON.parse(json);
                return p.id || p.selected_id || '';
            }
        } catch (_) {}
    }
    return '';
};

const buildQuoted = (conn, parent, quotedMessage, contextInfo) => {
    if (!quotedMessage) return null;

    const quotedType = getContentType(quotedMessage);
    const quoted = {
        key: {
            remoteJid: parent.chat,
            fromMe: false,
            id: contextInfo?.stanzaId || '',
            participant: contextInfo?.participant || ''
        },
        id: contextInfo?.stanzaId || '',
        chat: parent.chat,
        sender: jidNormalizedUser(contextInfo?.participant || parent.chat),
        participant: contextInfo?.participant || '',
        stanzaId: contextInfo?.stanzaId || '',
        message: quotedMessage,
        msg: quotedMessage[quotedType],
        mtype: quotedType,
        body: getText(quotedMessage, quotedType),
        text: getText(quotedMessage, quotedType),
        fromMe: false
    };

    quoted.reply = (text, chatId = parent.chat, options = {}) =>
        conn.sendMessage(chatId, { text }, { quoted: parent, ...options });

    quoted.download = async () => {
        if (!quoted.msg || !quotedType) throw new Error('Quoted message has no downloadable media');
        const stream = await downloadContentFromMessage(quoted.msg, quotedType.replace('Message', '').toLowerCase());
        const chunks = [];
        for await (const chunk of stream) chunks.push(chunk);
        return Buffer.concat(chunks);
    };

    return quoted;
};

const sms = (conn, m) => {
    if (!m) return m;

    if (m.key) {
        m.id = m.key.id;
        m.isBaileys = m.id?.startsWith('BAE5') && m.id?.length === 16;
        m.chat = m.key.remoteJid;
        m.fromMe = Boolean(m.key.fromMe);
        m.isGroup = String(m.chat || '').endsWith('@g.us');
        m.sender = jidNormalizedUser(
            m.fromMe ? conn.user?.id : (m.participant || m.key.participant || m.chat)
        );
    }

    if (m.message) {
        m.mtype = getContentType(m.message);

        if (m.mtype === 'viewOnceMessageV2' || m.mtype === 'viewOnceMessage' || m.mtype === 'ephemeralMessage') {
            const wrapper = m.message[m.mtype];
            if (wrapper?.message) {
                m.message = wrapper.message;
                m.mtype = getContentType(m.message);
            }
        }

        m.msg = m.message[m.mtype];
        const contextInfo = m.msg?.contextInfo;
        m.quoted = buildQuoted(conn, m, contextInfo?.quotedMessage, contextInfo);
        m.body = getText(m.message, m.mtype);
        m.text = m.body;

        m.reply = (text, chatId = m.chat, options = {}) =>
            conn.sendMessage(chatId, { text }, { quoted: m, ...options });
    }

    return m;
};

module.exports = { sms };
