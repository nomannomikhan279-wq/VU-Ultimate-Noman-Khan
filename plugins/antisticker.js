// ============================================
// 🎟️ ANTI-STICKER - VU ULTIMATE
// Delete sticker + warning; 3 warnings = kick
// ============================================
const { cmd } = require('../redx');
const fs = require('fs-extra');
const path = require('path');
const { addWarning, resetWarnings } = require('../lib/warnings');

const STATUS_FILE = path.join(__dirname, '..', 'lib', 'antisticker.json');
const attached = new WeakSet();

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}
function numberOf(jid) { return normalizeJid(jid).split('@')[0].replace(/[^0-9]/g, ''); }
function readStatus() {
    try { return fs.readJsonSync(STATUS_FILE); } catch (_) { return {}; }
}
function writeStatus(data) { fs.writeJsonSync(STATUS_FILE, data, { spaces: 2 }); }
function isAdminJid(jid, admins = []) {
    return admins.some(a => numberOf(a) === numberOf(jid));
}

async function getGroupContext(conn, from, sender) {
    const metadata = await conn.groupMetadata(from);
    const participants = metadata?.participants || [];
    const groupAdmins = participants.filter(p => p.admin === 'admin' || p.admin === 'superadmin').map(p => p.id);
    const botNumber = numberOf(conn.user?.id);
    return {
        metadata,
        participants,
        groupAdmins,
        isAdmins: isAdminJid(sender, groupAdmins),
        isBotAdmins: isAdminJid(conn.user?.id, groupAdmins) || groupAdmins.some(a => numberOf(a) === botNumber)
    };
}

async function warnSticker(conn, mek, from, sender, groupAdmins, isBotAdmins) {
    const target = normalizeJid(sender);
    if (!target || isAdminJid(target, groupAdmins) || numberOf(target) === numberOf(conn.user?.id)) return;

    if (!isBotAdmins) return;

    try { await conn.sendMessage(from, { delete: mek.key }); }
    catch (e) { console.error('[ANTISTICKER] Delete failed:', e.message); }

    const count = await addWarning(from, target);
    const mention = [target];

    if (count >= 3) {
        await conn.sendMessage(from, {
            text: `🚨 @${numberOf(target)} reached 3/3 sticker warnings.\n👢 User will be removed.`,
            mentions: mention
        }, { quoted: mek });
        try {
            await conn.groupParticipantsUpdate(from, [target], 'remove');
            await resetWarnings(from, target);
        } catch (e) {
            console.error('[ANTISTICKER] Kick failed:', e.message);
            await conn.sendMessage(from, { text: '❌ Could not remove the user. Check bot admin permission.' }, { quoted: mek });
        }
        return;
    }

    await conn.sendMessage(from, {
        text: `🎟️ @${numberOf(target)} WARNING ${count}/3\n\n🚫 Stickers are not allowed.\n🗑️ Sticker deleted.\n⚠️ 3 warnings = automatic kick.`,
        mentions: mention
    }, { quoted: mek });
}

function attachStickerListener(conn) {
    if (!conn || attached.has(conn)) return;
    attached.add(conn);

    conn.ev.on('messages.upsert', async ({ messages = [] }) => {
        for (const mek of messages) {
            try {
                const from = mek?.key?.remoteJid || '';
                if (!from.endsWith('@g.us')) continue;
                if (!mek?.message?.stickerMessage) continue;

                const status = readStatus();
                if (!status[from]) continue;

                const sender = mek.key?.participant || from;
                const { groupAdmins, isAdmins, isBotAdmins } = await getGroupContext(conn, from, sender);
                if (isAdmins || !isBotAdmins) continue;

                await warnSticker(conn, mek, from, sender, groupAdmins, isBotAdmins);
            } catch (e) {
                console.error('[ANTISTICKER] Listener error:', e.message);
            }
        }
    });
}

cmd({
    pattern: 'antisticker',
    alias: ['nosticker', 'stickerfilter'],
    desc: '🎟️ Anti-Sticker system for groups',
    category: 'admin',
    react: '🎟️',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, args, prefix, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!isAdmins && !isOwner) return reply('🚫 Only group admins can use .antisticker.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to delete stickers and kick users.');

    const status = readStatus();
    const action = String(args?.[0] || '').toLowerCase();

    if (!action || !['on', 'off'].includes(action)) {
        return reply(`🎟️ *ANTI-STICKER SYSTEM*\n\n📌 Status: ${status[from] ? '✅ ON' : '❌ OFF'}\n\n• ${prefix}antisticker on\n• ${prefix}antisticker off\n\n🚫 Sticker deleted + warning\n⚠️ 3 warnings = automatic kick`);
    }

    if (action === 'on') {
        status[from] = true;
        writeStatus(status);
        attachStickerListener(conn);
        return reply('✅ *Anti-Sticker Activated!*\n\n🎟️ Stickers will be deleted automatically.\n⚠️ 3 warnings = automatic kick.');
    }

    status[from] = false;
    writeStatus(status);
    return reply('❌ *Anti-Sticker Deactivated!*\n\n🎟️ Sticker filtering is now OFF.');
});

// Attach after the first normal message so sticker events are handled independently
// of main.js body-text extraction.
cmd({
    on: 'body',
    desc: 'Initializes anti-sticker listener',
    category: 'admin',
    filename: __filename
}, async (conn) => attachStickerListener(conn));

console.log('🎟️ VU ULTIMATE - Anti-Sticker Plugin Loaded!');
