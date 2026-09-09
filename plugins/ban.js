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

function normalizeNumber(value) {
    const digits = String(value || '').replace(/[^0-9]/g, '');
    return digits;
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

function attachBanListener(conn) {
    if (!conn || listeners.has(conn)) return;
    listeners.add(conn);

    conn.ev.on('group-participants.update', async (update) => {
        try {
            if (!update || update.action !== 'add') return;

            const banned = new Set(readBans());
            if (!banned.size) return;

            const targets = (update.participants || [])
                .map(p => normalizeJid(p?.id || p?.phoneNumber || p))
                .filter(Boolean)
                .filter(jid => banned.has(numberOf(jid)));

            if (!targets.length) return;

            let metadata;
            try {
                metadata = await conn.groupMetadata(update.id);
            } catch (e) {
                console.error('[BAN] Group metadata error:', e.message);
                return;
            }

            const admins = (metadata.participants || [])
                .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
                .map(p => normalizeJid(p.id || p.phoneNumber));

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
                text: `🚫 *BANNED USER REMOVED*\n\n${kickTargets.map(j => `@${numberOf(j)}`).join(', ')} was permanently banned and has been removed automatically.`,
                mentions: kickTargets
            });
        } catch (e) {
            console.error('[BAN] Participant update error:', e.message);
        }
    });
}

// Attach protection whenever the bot processes a message.
cmd({
    on: 'body',
    desc: 'Keeps permanent-ban protection active',
    category: 'admin',
    filename: __filename
}, async (conn) => {
    attachBanListener(conn);
});

cmd({
    pattern: 'ban',
    alias: ['banuser'],
    desc: 'Permanently ban a user by phone number',
    category: 'admin',
    react: '🚫',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, groupMetadata, q, reply }) => {
    attachBanListener(conn);

    if (!isGroup) return reply('❌ This command can only be used in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .ban.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to ban and remove users.');

    // New syntax: .ban 923001234567
    // The user does NOT need to be in the group.
    const targetNum = normalizeNumber(q);
    if (!targetNum) {
        return reply('❌ Enter the user number.\n\nExample: .ban 923001234567');
    }

    if (targetNum.length < 7 || targetNum.length > 15) {
        return reply('❌ Invalid phone number. Use the full international number.\n\nExample: .ban 923001234567');
    }

    const botNum = numberOf(conn.user?.id);
    if (targetNum === botNum) return reply('🤖 I cannot ban myself.');

    const ownerNumbers = Array.isArray(require('../config').OWNER_NUMBER)
        ? require('../config').OWNER_NUMBER.map(normalizeNumber)
        : [];
    if (ownerNumbers.includes(targetNum)) {
        return reply('👑 I cannot permanently ban the bot owner.');
    }

    const bans = readBans();
    if (!bans.includes(targetNum)) bans.push(targetNum);
    writeBans(bans);

    // If the user is currently in this group, remove them immediately.
    const members = Array.isArray(groupMetadata?.participants) ? groupMetadata.participants : [];
    const targetMember = members.find(p => numberOf(p.id || p.phoneNumber) === targetNum);

    if (targetMember) {
        const targetIsAdmin = targetMember.admin === 'admin' || targetMember.admin === 'superadmin';
        if (targetIsAdmin) {
            // Do not leave a permanent ban behind when an admin cannot be removed.
            writeBans(bans.filter(n => n !== targetNum));
            return reply('🛡️ You cannot ban a group admin.');
        }

        try {
            await conn.groupParticipantsUpdate(from, [`${targetNum}@s.whatsapp.net`], 'remove');
        } catch (e) {
            console.error('[BAN] Immediate kick failed:', e.message);
        }
    }

    return conn.sendMessage(from, {
        text: `🚫 @${targetNum} has been *PERMANENTLY BANNED*.\n\n${targetMember ? 'The user has been removed from this group.\n' : 'The user is not currently in this group.\n'}\nIf this user tries to join any group where this bot is active, I will automatically remove them.`,
        mentions: [`${targetNum}@s.whatsapp.net`]
    }, { quoted: mek });
});

cmd({
    pattern: 'unban',
    alias: ['unbanuser'],
    desc: 'Remove a user from the permanent ban list by phone number',
    category: 'admin',
    react: '♻️',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, q, reply }) => {
    attachBanListener(conn);

    if (!isGroup) return reply('❌ This command can only be used in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .unban.');

    const targetNum = normalizeNumber(q);
    if (!targetNum) return reply('❌ Enter the user number.\n\nExample: .unban 923001234567');

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
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner }) => {
    attachBanListener(conn);

    if (!isGroup) return conn.sendMessage(from, { text: '❌ This command can only be used in groups.' }, { quoted: mek });
    if (!isAdmins && !isOwner) return conn.sendMessage(from, { text: '🚫 Only group admins can use .banlist.' }, { quoted: mek });

    const bans = readBans();
    if (!bans.length) return conn.sendMessage(from, { text: '📋 Ban list is empty.' }, { quoted: mek });

    return conn.sendMessage(from, {
        text: `🚫 *PERMANENT BAN LIST*\n\n${bans.map((n, i) => `${i + 1}. @${n}`).join('\n')}`,
        mentions: bans.map(n => `${n}@s.whatsapp.net`)
    }, { quoted: mek });
});

module.exports = { attachBanListener };
