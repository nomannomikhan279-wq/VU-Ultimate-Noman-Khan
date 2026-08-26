const { cmd } = require('../redx');
const { addWarning, resetWarnings } = require('../lib/warnings');

const LINK_REGEX = /(?:https?:\/\/|www\.|wa\.me\/|chat\.whatsapp\.com\/|t\.me\/|discord\.gg\/|discord\.com\/invite\/)[^\s]+/i;

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

function isProtectedUser(jid, groupAdmins, isOwner) {
    const clean = normalizeJid(jid);
    if (!clean) return true;
    if (isOwner) return true;
    return (groupAdmins || []).some(a => normalizeJid(a).split('@')[0] === clean.split('@')[0]);
}

function getMentionedJid(m) {
    const mentioned = m?.msg?.contextInfo?.mentionedJid;
    if (Array.isArray(mentioned) && mentioned.length) return normalizeJid(mentioned[0]);
    if (typeof mentioned === 'string') return normalizeJid(mentioned);
    return '';
}

async function enforceWarning(conn, mek, m, {
    from,
    target,
    groupAdmins = [],
    isBotAdmins = false,
    reason,
    reply
}) {
    if (!target) return reply('❌ Please tag a group member.');

    const targetIsAdmin = groupAdmins.some(a => normalizeJid(a).split('@')[0] === target.split('@')[0]);
    if (targetIsAdmin) return reply('🛡️ Admins cannot receive automatic warnings.');

    if (target === normalizeJid(conn.user?.id)) return reply('🤖 I cannot warn myself.');

    const count = await addWarning(from, target);
    const mention = [target];

    if (mek?.key && isBotAdmins) {
        try {
            await conn.sendMessage(from, { delete: mek.key });
        } catch (e) {
            console.error('[WARN] Message delete failed:', e.message);
        }
    }

    if (count >= 3) {
        let kickText = `🚨 @${target.split('@')[0]} has received 3/3 warnings.\n\n❌ Final warning limit reached. User will be removed from the group.`;
        if (!isBotAdmins) {
            kickText += '\n\n⚠️ I need to be an admin to remove the user.';
            return conn.sendMessage(from, { text: kickText, mentions: mention }, { quoted: mek });
        }

        await conn.sendMessage(from, { text: kickText, mentions: mention }, { quoted: mek });
        try {
            await conn.groupParticipantsUpdate(from, [target], 'remove');
            await resetWarnings(from, target);
        } catch (e) {
            console.error('[WARN] Kick failed:', e.message);
            return conn.sendMessage(from, {
                text: '❌ I could not remove the user. Please make sure I am a group admin.',
                mentions: mention
            }, { quoted: mek });
        }
        return;
    }

    const icon = reason === 'link' ? '🔗' : '⚠️';
    const reasonText = reason === 'link' ? 'Links are not allowed.' : 'Rule violation.';
    return conn.sendMessage(from, {
        text: `${icon} @${target.split('@')[0]} WARNING ${count}/3\n\n${reasonText}\n⚠️ 3 warnings = automatic kick.`,
        mentions: mention
    }, { quoted: mek });
}

// Admin command: .warn @user
cmd({
    pattern: 'warn',
    alias: ['warning'],
    desc: 'Warn a tagged group member (3 warnings = kick)',
    category: 'admin',
    react: '⚠️',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isBotAdmins, groupAdmins, isOwner, reply }) => {
    if (!isGroup) return reply('❌ This command can only be used in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .warn.');

    const target = getMentionedJid(m);
    if (!target) return reply('❌ Tag the user you want to warn.\n\nExample: .warn @923001234567');
    if (isProtectedUser(target, groupAdmins, false)) return reply('🛡️ You cannot warn a group admin.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to issue/delete warnings and kick at 3/3.');

    try {
        await enforceWarning(conn, mek, m, {
            from,
            target,
            groupAdmins,
            isBotAdmins,
            reason: 'manual',
            reply
        });
    } catch (error) {
        console.error('[WARN] Manual warning error:', error);
        return reply('❌ Failed to save the warning. Please check the MongoDB connection.');
    }
});

// Automatic protection: links only.
cmd({
    on: 'body',
    desc: 'Automatic link warning system',
    category: 'admin',
    filename: __filename
}, async (conn, mek, m, { from, body, isGroup, sender, isOwner, isBotAdmins, isAdmins, groupAdmins, reply }) => {
    if (!isGroup) return;
    if (!sender || sender === from) return;
    if (isOwner || isAdmins) return;

    const hasLink = typeof body === 'string' && LINK_REGEX.test(body);
    if (!hasLink) return;

    const target = normalizeJid(sender);
    if (!target) return;

    try {
        await enforceWarning(conn, mek, m, {
            from,
            target,
            groupAdmins,
            isBotAdmins,
            reason: 'link',
            reply
        });
    } catch (error) {
        console.error('[WARN] Automatic link warning error:', error);
    }
});
