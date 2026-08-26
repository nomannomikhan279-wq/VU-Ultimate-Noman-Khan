// ============================================
// 🎟️ ANTI-STICKER - VU ULTIMATE
// 👑 Developer: Noman Khan
// 🗑️ Delete sticker + warn (3 warnings = kick)
// ============================================

const { cmd } = require('../redx');
const { addWarning, resetWarnings } = require('../lib/warnings');

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

function isAdminJid(jid, groupAdmins = []) {
    const num = normalizeJid(jid).split('@')[0];
    return groupAdmins.some(a => normalizeJid(a).split('@')[0] === num);
}

async function warnSticker(conn, mek, {
    from,
    sender,
    groupAdmins = [],
    isBotAdmins = false
}) {
    const target = normalizeJid(sender);
    if (!target || isAdminJid(target, groupAdmins)) return;
    if (target === normalizeJid(conn.user?.id)) return;

    // Delete the sticker first when the bot has admin permission.
    if (isBotAdmins && mek?.key) {
        try {
            await conn.sendMessage(from, { delete: mek.key });
        } catch (e) {
            console.error('[ANTISTICKER] Delete failed:', e.message);
        }
    }

    const count = await addWarning(from, target);
    const mention = [target];

    if (count >= 3) {
        if (!isBotAdmins) {
            return conn.sendMessage(from, {
                text: `🚨 @${target.split('@')[0]} reached 3/3 warnings for stickers.\n\n⚠️ I need to be a group admin to remove the user.`,
                mentions: mention
            }, { quoted: mek });
        }

        await conn.sendMessage(from, {
            text: `🚨 @${target.split('@')[0]} reached 3/3 warnings.\n\n🎟️ Repeated sticker violations detected.\n👢 User will be removed from the group.`,
            mentions: mention
        }, { quoted: mek });

        try {
            await conn.groupParticipantsUpdate(from, [target], 'remove');
            await resetWarnings(from, target);
        } catch (e) {
            console.error('[ANTISTICKER] Kick failed:', e.message);
            await conn.sendMessage(from, {
                text: '❌ I could not remove the user. Please make sure I am a group admin.',
                mentions: mention
            }, { quoted: mek });
        }
        return;
    }

    await conn.sendMessage(from, {
        text: `🎟️ @${target.split('@')[0]} WARNING ${count}/3\n\n🚫 Stickers are not allowed in this group.\n🗑️ Sticker deleted.\n⚠️ 3 warnings = automatic kick.`,
        mentions: mention
    }, { quoted: mek });
}

// ============================================
// 📌 COMMAND: .antisticker on/off
// ============================================
cmd({
    pattern: 'antisticker',
    alias: ['nosticker', 'stickerfilter'],
    desc: '🎟️ Anti-Sticker system for groups',
    category: 'admin',
    react: '🎟️',
    filename: __filename
}, async (conn, mek, m, {
    from,
    isGroup,
    isAdmins,
    isOwner,
    isBotAdmins,
    args,
    prefix,
    reply
}) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .antisticker.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to delete stickers and kick users.');

    if (!global.ANTISTICKER_STATUS) global.ANTISTICKER_STATUS = {};

    const action = String(args?.[0] || '').toLowerCase();

    if (!action || !['on', 'off'].includes(action)) {
        const status = global.ANTISTICKER_STATUS[from] ? '✅ ON' : '❌ OFF';
        return reply(`🎟️ *ANTI-STICKER SYSTEM*\n\n📌 Status: ${status}\n\n• ${prefix}antisticker on\n• ${prefix}antisticker off\n\n🚫 When ON: sticker deleted + warning\n⚠️ 3 warnings = automatic kick`);
    }

    if (action === 'on') {
        global.ANTISTICKER_STATUS[from] = true;
        return reply('✅ *Anti-Sticker Activated!*\n\n🎟️ Stickers will be deleted automatically.\n⚠️ Sender will receive a warning.\n🚨 3 warnings = automatic kick.');
    }

    global.ANTISTICKER_STATUS[from] = false;
    return reply('❌ *Anti-Sticker Deactivated!*\n\n🎟️ Stickers will no longer be filtered.');
});

// ============================================
// 📌 AUTOMATIC STICKER HANDLER
// ============================================
cmd({
    on: 'body',
    desc: 'Automatic sticker deletion and warning',
    category: 'admin',
    filename: __filename
}, async (conn, mek, m, {
    from,
    isGroup,
    sender,
    isOwner,
    isAdmins,
    isBotAdmins,
    groupAdmins
}) => {
    if (!isGroup) return;
    if (!global.ANTISTICKER_STATUS?.[from]) return;
    if (!sender || sender === from) return;
    if (isOwner || isAdmins) return;
    if (!isBotAdmins) return;

    const type = m?.mtype || '';
    if (type !== 'stickerMessage') return;

    try {
        await warnSticker(conn, mek, {
            from,
            sender,
            groupAdmins,
            isBotAdmins
        });
    } catch (error) {
        console.error('[ANTISTICKER] Warning error:', error);
    }
});

console.log('🎟️ VU ULTIMATE - Anti-Sticker Plugin Loaded!');
