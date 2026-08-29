var commands = [];

async function enrichBodyContext(conn, mek, context = {}) {
    const from = context.from || mek?.key?.remoteJid || '';
    const sender = context.sender || mek?.key?.participant || from;
    const enriched = { ...context };

    enriched.from = from;
    enriched.sender = sender;
    enriched.senderNumber = enriched.senderNumber || String(sender).split('@')[0].replace(/[^0-9]/g, '');
    enriched.pushname = enriched.pushname || mek?.pushName || 'User';
    enriched.text = enriched.text ?? enriched.body ?? '';
    enriched.q = enriched.q ?? enriched.text;
    enriched.args = enriched.args || [];

    if (from.endsWith('@g.us') && typeof conn?.groupMetadata === 'function') {
        try {
            const metadata = await conn.groupMetadata(from);
            const participants = metadata?.participants || [];
            const groupAdmins = participants
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => p.id);

            enriched.groupMetadata = enriched.groupMetadata || metadata;
            enriched.groupName = enriched.groupName || metadata?.subject || 'Unknown Group';
            enriched.participants = enriched.participants?.length ? enriched.participants : participants;
            enriched.groupAdmins = enriched.groupAdmins?.length ? enriched.groupAdmins : groupAdmins;
            enriched.isAdmins = enriched.isAdmins ?? groupAdmins.some(a => String(a).split('@')[0] === String(sender).split('@')[0]);

            const botNumber = String(conn?.user?.id || '').split(':')[0].split('@')[0];
            enriched.isBotAdmins = enriched.isBotAdmins ?? groupAdmins.some(a => String(a).split('@')[0] === botNumber);
        } catch (_) {}
    }

    enriched.isGroup = enriched.isGroup ?? from.endsWith('@g.us');
    enriched.isCreator = enriched.isCreator ?? enriched.isOwner;
    enriched.reply = enriched.reply || ((text) => conn.sendMessage(from, { text }, { quoted: mek }));
    return enriched;
}

function cmd(info, func) {
    var data = { ...(info || {}) };
    data.function = func;

    if (!data.pattern && data.cmdname) data.pattern = data.cmdname;
    if (data.pattern) data.pattern = String(data.pattern).trim().toLowerCase();
    data.alias = Array.isArray(data.alias) ? data.alias.map(a => String(a).trim().toLowerCase()) : [];
    data.dontAddCommandList = Boolean(data.dontAddCommandList);
    data.desc = data.desc || '';
    data.fromMe = Boolean(data.fromMe);
    data.category = data.category || 'misc';

    if (data.on === 'body' && typeof func === 'function') {
        data.function = async (conn, mek, m, context) => {
            const enriched = await enrichBodyContext(conn, mek, context);
            return func(conn, mek, m, enriched);
        };
    }

    commands.push(data);
    return data;
}

module.exports = { cmd, AddCommand: cmd, Function: cmd, commands };
