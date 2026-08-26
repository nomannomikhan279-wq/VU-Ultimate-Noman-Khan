// ============================================
// 🔒 VU ULTIMATE - GROUP OPEN/CLOSE + SCHEDULE
// 👑 Developer: Noman Khan
// ============================================

const { cmd } = require('../redx');
const moment = require('moment-timezone');
const { normalizeTime, getSchedule, setSchedule, disableSchedule, GroupSchedule } = require('../lib/group-schedules');

const TIMEZONE = 'Asia/Karachi';
const socketMap = global.VU_GROUP_SOCKETS || (global.VU_GROUP_SOCKETS = new Map());

function cleanNumber(value) { return String(value || '').replace(/[^0-9]/g, ''); }
function botNumber(conn) { return cleanNumber(conn?.user?.id?.split(':')[0]?.split('@')[0]); }
function rememberSocket(conn, from) {
    const number = botNumber(conn);
    if (number && from?.endsWith('@g.us')) socketMap.set(`${number}:${from}`, conn);
    return number;
}
function adminOnly(isAdmins, isOwner) { return Boolean(isAdmins || isOwner); }
async function closeGroup(conn, from) { await conn.groupSettingUpdate(from, 'announcement'); }
async function openGroup(conn, from) { await conn.groupSettingUpdate(from, 'not_announcement'); }

cmd({ on: 'body', desc: 'Track active socket for group scheduler', category: 'group', dontAddCommandList: true, filename: __filename }, async (conn, mek, m, { from }) => {
    rememberSocket(conn, from);
});

// .open — open immediately
cmd({ pattern: 'open', alias: ['groupopen', 'gopen', 'opengroup'], desc: 'Open group', category: 'group', react: '🔓', filename: __filename }, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!adminOnly(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ Make me a group admin first.');
    try { await openGroup(conn, from); return reply('🔓 *Group Opened*\n\nEveryone can send messages now.'); }
    catch (e) { console.error('[GROUP] Open error:', e.message); return reply('❌ Could not open the group.'); }
});

// .close — close immediately
cmd({ pattern: 'close', alias: ['groupclose', 'gclose', 'closegroup'], desc: 'Close group', category: 'group', react: '🔒', filename: __filename }, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!adminOnly(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ Make me a group admin first.');
    try { await closeGroup(conn, from); return reply('🔒 *Group Closed*\n\nOnly admins can send messages now.'); }
    catch (e) { console.error('[GROUP] Close error:', e.message); return reply('❌ Could not close the group.'); }
});

// .settime 10:00 to 19:00 — first time opens, second time closes daily
cmd({ pattern: 'settime', alias: ['settimes'], desc: 'Set daily open and close time', category: 'group', react: '⏰', filename: __filename }, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, args, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!adminOnly(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ Make me a group admin first.');

    const text = String(args?.join(' ') || '').trim();
    const match = text.match(/(\d{1,2}:\d{2})\s*(?:to|-|–|—)\s*(\d{1,2}:\d{2})/i);
    if (!match) return reply('❌ Use: .settime 10:00 to 19:00');

    const openTime = normalizeTime(match[1]);
    const closeTime = normalizeTime(match[2]);
    if (!openTime || !closeTime) return reply('❌ Invalid time. Use 24-hour format.');
    if (openTime === closeTime) return reply('❌ Open and close time cannot be the same.');

    const number = rememberSocket(conn, from);
    try {
        await setSchedule(from, number, { openTime, closeTime, enabled: true, timezone: TIMEZONE });
        return reply(`✅ *Group schedule saved.*\n\n🔓 Open: ${openTime}\n🔒 Close: ${closeTime}\n🌍 Asia/Karachi\n\nThe group will follow this schedule every day.`);
    } catch (e) { console.error('[GROUP-SCHEDULE] Save error:', e.message); return reply('❌ Could not save the schedule.'); }
});

// .closeon 19:00 — set only the daily close time
cmd({ pattern: 'closeon', alias: ['setclose', 'closeat'], desc: 'Set daily close time', category: 'group', react: '🔒', filename: __filename }, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, args, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!adminOnly(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ Make me a group admin first.');

    const closeTime = normalizeTime(args?.[0]);
    if (!closeTime) return reply('❌ Use: .closeon 19:00');

    const number = rememberSocket(conn, from);
    try {
        await setSchedule(from, number, { closeTime, enabled: true, timezone: TIMEZONE });
        return reply(`✅ *Daily close time set.*\n\n🔒 Group will close every day at: ${closeTime}\n🌍 Asia/Karachi`);
    } catch (e) { console.error('[GROUP-SCHEDULE] Close time error:', e.message); return reply('❌ Could not save the close time.'); }
});

cmd({ pattern: 'timestatus', alias: ['schedulestatus'], desc: 'Show group schedule', category: 'group', react: '⏰', filename: __filename }, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!adminOnly(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    try {
        const s = await getSchedule(from);
        if (!s || s.enabled === false || (!s.openTime && !s.closeTime)) return reply('⏰ *GROUP SCHEDULE*\n\n❌ No active schedule.');
        return reply(`⏰ *GROUP SCHEDULE*\n\n🔓 Open: ${s.openTime || 'OFF'}\n🔒 Close: ${s.closeTime || 'OFF'}\n🌍 ${s.timezone || TIMEZONE}\n📌 ${s.enabled ? '✅ ON' : '❌ OFF'}`);
    } catch (e) { return reply('❌ Could not read the schedule.'); }
});

cmd({ pattern: 'timeoff', alias: ['scheduleoff', 'unsettime'], desc: 'Disable group schedule', category: 'group', react: '⏹️', filename: __filename }, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, reply }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!adminOnly(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    try { await disableSchedule(from); return reply('✅ Group schedule disabled.'); }
    catch (e) { return reply('❌ Could not disable the schedule.'); }
});

// Persistent daily scheduler. Checks every 20 seconds.
if (!global.VU_GROUP_SCHEDULER_STARTED) {
    global.VU_GROUP_SCHEDULER_STARTED = true;
    setInterval(async () => {
        try {
            const schedules = await GroupSchedule.find({ enabled: true }).lean();
            const now = moment().tz(TIMEZONE);
            const hhmm = now.format('HH:mm');
            const dayKey = now.format('YYYY-MM-DD');

            for (const s of schedules) {
                if (!s.groupJid || !s.botNumber) continue;
                const conn = socketMap.get(`${s.botNumber}:${s.groupJid}`);
                if (!conn) continue;

                if (s.openTime === hhmm && s.lastOpenKey !== dayKey) {
                    try {
                        await openGroup(conn, s.groupJid);
                        await GroupSchedule.updateOne({ _id: s._id }, { $set: { lastOpenKey: dayKey } });
                        console.log(`🔓 [GROUP-SCHEDULE] Opened ${s.groupJid} at ${hhmm}`);
                    } catch (e) { console.error('[GROUP-SCHEDULE] Open failed:', e.message); }
                }

                if (s.closeTime === hhmm && s.lastCloseKey !== dayKey) {
                    try {
                        await closeGroup(conn, s.groupJid);
                        await GroupSchedule.updateOne({ _id: s._id }, { $set: { lastCloseKey: dayKey } });
                        console.log(`🔒 [GROUP-SCHEDULE] Closed ${s.groupJid} at ${hhmm}`);
                    } catch (e) { console.error('[GROUP-SCHEDULE] Close failed:', e.message); }
                }
            }
        } catch (e) { console.error('[GROUP-SCHEDULE] Scheduler error:', e.message); }
    }, 20000);
}
