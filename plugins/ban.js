const { cmd } = require('../redx');
const fs = require('fs-extra');

const BAN_FILE = './lib/ban.json';
const listeners = new WeakSet();

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

function numberOf(jid) {
    return normalizeJid(jid).split('@')[0].replace(/[^0-9]/g, '');
}

function readBans() {
    try {
        if (!fs.existsSync(BAN_FILE)) fs.writeJsonSync(BAN_FILE, [], { spaces: 2 });
        const data = fs.readJsonSync(BAN_FILE);
        return Array.isArray(data) ? data.map(numberOf).filter(Boolean) : [];
    } catch (e) {
        console.error('[BAN] Read error:', e.message);
        return [];
    }
}

function writeBans(list) {
    const clean = [...new Set(list.map(numberOf).filter(Boolean))];
    fs.writeJsonSync(BAN_FILE, clean, { spaces: 2 });
    return clean;
}

function getMentionedJid(m) {
    const mentioned = m?.msg?.contextInfo?.mentionedJid;
    if (Array.isArray(mentioned) && mentioned.length) return normalizeJid(mentioned[0]);
    if (typeof mentioned === 'string') return normalizeJid(mentioned);
    return '';
}

function attachBanListener(conn) {
    if (!conn || listeners.has(conn)) return;
    listeners.add(conn);

    conn.ev.on('group-participants.update', async (update) => {
        try {
            if (!update || update.action !== 'add') return;

            const banned = new Set(readBans());
            if (!banned.size) return;

            const targets = (update.participants || [])
                .map(normalizeJid)
                .filter(Boolean)
                .filter(jid => banned.has(numberOf(jid)));

            if (!targets.length) return;

            // Fetch metadata so admins/owner can be protected from accidental kicks.
            let metadata;
            try {
                metadata = await conn.groupMetadata(update.id);
            } catch (e) {
                console.error('[BAN] Group metadata error:', e.message);
                return;
            }

            const admins = (metadata.participants || [])
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => normalizeJid(p.id));

            const kickTargets = targets.filter(jid =>
                !admins.some(a => numberOf(a) === numberOf(jid))
            );

            if (!kickTargets.length) return;

            try {
                await conn.groupParticipantsUpdate(update.id, kickTargets, 'remove');
            } catch (e) {
                console.error('[BAN] Auto-kick failed:', e.message);
                return;
            }

            await conn.sendMessage(update.id, {
                text: `🚫 *BANNED USER REMOVED*\n\n${kickTargets.map(j => `@${numberOf(j)}`).join(', ')} was banned from this group and has been removed automatically.`,
                mentions: kickTargets
            });
        } catch (e) {
            console.error('[BAN] Participant update error:', e.message);
        }
    });
}

cmd({
    pattern: 'ban',
    alias: ['banuser'],
    desc: 'Permanently ban a tagged user',
    category: 'admin',
    react: '🚫',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, groupAdmins, reply }) => {
    attachBanListener(conn);

    if (!isGroup) return reply('❌ This command can only be used in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .ban.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to ban and remove users.');

    const target = getMentionedJid(m);
    if (!target) return reply('❌ Tag the user you want to ban.\n\nExample: .ban @923001234567');

    const targetNum = numberOf(target);
    if (!targetNum) return reply('❌ Invalid user.');
    if (targetNum === numberOf(conn.user?.id)) return reply('🤖 I cannot ban myself.');

    const isTargetAdmin = (groupAdmins || []).some(a => numberOf(a) === targetNum);
    if (isTargetAdmin) return reply('🛡️ You cannot ban a group admin.');

    const bans = readBans();
    if (!bans.includes(targetNum)) bans.push(targetNum);
    writeBans(bans);

    // If the target is currently in the group, remove them immediately.
    try {
        await conn.groupParticipantsUpdate(from, [`${targetNum}@s.whatsapp.net`], 'remove');
    } catch (e) {
        console.error('[BAN] Immediate kick failed:', e.message);
    }

    return conn.sendMessage(from, {
        text: `🚫 @${targetNum} has been *PERMANENTLY BANNED*.\n\nIf this user joins the group again, I will automatically remove them.`,
        mentions: [`${targetNum}@s.whatsapp.net`]
    }, { quoted: mek });
});

cmd({
    pattern: 'unban',
    alias: ['unbanuser'],
    desc: 'Remove a user from the permanent ban list',
    category: 'admin',
    react: '♻️',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, reply }) => {
    attachBanListener(conn);

    if (!isGroup) return reply('❌ This command can only be used in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .unban.');

    const target = getMentionedJid(m);
    if (!target) return reply('❌ Tag the user you want to unban.\n\nExample: .unban @923001234567');

    const targetNum = numberOf(target);
    const bans = readBans();
    if (!bans.includes(targetNum)) return reply(`ℹ️ @${targetNum} is not on the ban list.`);

    writeBans(bans.filter(n => n !== targetNum));
    return conn.sendMessage(from, {
        text: `♻️ @${targetNum} has been *UNBANNED*.\n\nThey can join the group again.`,
        mentions: [`${targetNum}@s.whatsapp.net`]
    }, { quoted: mek });
});

cmd({
    pattern: 'banlist',
    alias: ['banned'],
    desc: 'Show permanently banned users',
    category: 'admin',
    react: '📋',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, reply }) => {
    attachBanListener(conn);

    if (!isGroup) return reply('❌ This command can only be used in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .banlist.');

    const bans = readBans();
    if (!bans.length) return reply('📋 Ban list is empty.');

    return reply(`🚫 *PERMANENT BAN LIST*\n\n${bans.map((n, i) => `${i + 1}. @${n}`).join('\n')}`, {
        mentions: bans.map(n => `${n}@s.whatsapp.net`)
    });
});
