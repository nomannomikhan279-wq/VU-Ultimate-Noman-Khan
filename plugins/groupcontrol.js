// ============================================
// 🔒 VU ULTIMATE - GROUP OPEN/CLOSE + SCHEDULE
// 👑 Developer: Noman Khan
// ============================================

const { cmd } = require('../redx');
const moment = require('moment-timezone');
const config = require('../config');
const {
    normalizeTime,
    getSchedule,
    setSchedule,
    disableSchedule,
    GroupSchedule
} = require('../lib/group-schedules');

const TIMEZONE = 'Asia/Karachi';
const socketMap = global.VU_GROUP_SOCKETS || (global.VU_GROUP_SOCKETS = new Map());

function cleanNumber(value) {
    return String(value || '').replace(/[^0-9]/g, '');
}

function botNumber(conn) {
    return cleanNumber(conn?.user?.id?.split(':')[0]?.split('@')[0]);
}

function rememberSocket(conn, from) {
    const number = botNumber(conn);
    if (number && from?.endsWith('@g.us')) {
        socketMap.set(`${number}:${from}`, conn);
    }
    return number;
}

function isGroupAdmin(isAdmins, isOwner) {
    return Boolean(isAdmins || isOwner);
}

async function setGroupMode(conn, from, mode) {
    return conn.groupSettingUpdate(from, mode === 'close' ? 'announcement' : 'not_announcement');
}

async function closeGroup(conn, from) {
    if (!conn?.groupSettingUpdate) throw new Error('GROUP_SETTING_UNAVAILABLE');
    await setGroupMode(conn, from, 'close');
}

async function openGroup(conn, from) {
    if (!conn?.groupSettingUpdate) throw new Error('GROUP_SETTING_UNAVAILABLE');
    await setGroupMode(conn, from, 'open');
}

function scheduleHelp(prefix) {
    return `🔒 *GROUP CONTROL*

${prefix}groupclose
→ Close group now

${prefix}groupopen
→ Open group now

${prefix}groupclose 22:00
→ Close every day at 22:00

${prefix}groupopen 07:00
→ Open every day at 07:00

${prefix}groupschedule close 22:00
${prefix}groupschedule open 07:00
${prefix}groupschedule status
${prefix}groupschedule off

🕐 Timezone: Asia/Karachi`;
}

// Save the latest socket for the scheduler whenever a message arrives.
cmd({
    on: 'body',
    desc: 'Track active WhatsApp sockets for group scheduler',
    category: 'group',
    dontAddCommandList: true,
    filename: __filename
}, async (conn, mek, m, { from }) => {
    rememberSocket(conn, from);
});

// Immediate close OR daily close when a time is supplied.
cmd({
    pattern: 'groupclose',
    alias: ['gclose', 'closegroup'],
    desc: 'Close group now or schedule daily close',
    category: 'group',
    react: '🔒',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, args, reply, prefix }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!isGroupAdmin(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to close the group.');

    const number = rememberSocket(conn, from);
    const requestedTime = args?.[0];

    if (requestedTime) {
        const time = normalizeTime(requestedTime);
        if (!time) return reply(`❌ Invalid time. Use 24-hour format.\nExample: ${prefix}groupclose 22:00`);
        try {
            await setSchedule(from, number, { closeTime: time, enabled: true, timezone: TIMEZONE });
            return reply(`✅ *Daily group close scheduled.*\n\n🔒 Close time: ${time}\n🌍 Timezone: Asia/Karachi\n\nThe group will automatically close every day at this time.`);
        } catch (e) {
            console.error('[GROUP-SCHEDULE] Save close error:', e);
            return reply('❌ Could not save the schedule. Please check the MongoDB connection.');
        }
    }

    try {
        await closeGroup(conn, from);
        return reply('🔒 *Group Closed*\n\nOnly admins can send messages now.');
    } catch (e) {
        console.error('[GROUP-CONTROL] Close error:', e);
        return reply('❌ I could not close the group. Make sure I am a group admin.');
    }
});

// Immediate open OR daily open when a time is supplied.
cmd({
    pattern: 'groupopen',
    alias: ['gopen', 'opengroup'],
    desc: 'Open group now or schedule daily open',
    category: 'group',
    react: '🔓',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, args, reply, prefix }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!isGroupAdmin(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin to open the group.');

    const number = rememberSocket(conn, from);
    const requestedTime = args?.[0];

    if (requestedTime) {
        const time = normalizeTime(requestedTime);
        if (!time) return reply(`❌ Invalid time. Use 24-hour format.\nExample: ${prefix}groupopen 07:00`);
        try {
            await setSchedule(from, number, { openTime: time, enabled: true, timezone: TIMEZONE });
            return reply(`✅ *Daily group open scheduled.*\n\n🔓 Open time: ${time}\n🌍 Timezone: Asia/Karachi\n\nThe group will automatically open every day at this time.`);
        } catch (e) {
            console.error('[GROUP-SCHEDULE] Save open error:', e);
            return reply('❌ Could not save the schedule. Please check the MongoDB connection.');
        }
    }

    try {
        await openGroup(conn, from);
        return reply('🔓 *Group Opened*\n\nAll members can send messages now.');
    } catch (e) {
        console.error('[GROUP-CONTROL] Open error:', e);
        return reply('❌ I could not open the group. Make sure I am a group admin.');
    }
});

// Combined schedule management.
cmd({
    pattern: 'groupschedule',
    alias: ['gschedule', 'groupsched'],
    desc: 'Manage daily group open/close schedule',
    category: 'group',
    react: '⏰',
    filename: __filename
}, async (conn, mek, m, { from, isGroup, isAdmins, isOwner, isBotAdmins, args, reply, prefix }) => {
    if (!isGroup) return reply('❌ This command only works in groups.');
    if (!isGroupAdmin(isAdmins, isOwner)) return reply('🚫 Only group admins/owner can use this command.');
    if (!isBotAdmins) return reply('❌ I need to be a group admin for scheduled open/close.');

    const number = rememberSocket(conn, from);
    const action = String(args?.[0] || '').toLowerCase();

    if (!action || action === 'help') return reply(scheduleHelp(prefix));

    if (action === 'status') {
        try {
            const s = await getSchedule(from);
            if (!s || (!s.closeTime && !s.openTime) || s.enabled === false) {
                return reply('⏰ *Group Schedule*\n\n❌ No active schedule.');
            }
            return reply(`⏰ *GROUP SCHEDULE*\n\n🔒 Daily close: ${s.closeTime || 'OFF'}\n🔓 Daily open: ${s.openTime || 'OFF'}\n🌍 Timezone: ${s.timezone || TIMEZONE}\n📌 Status: ${s.enabled ? '✅ ON' : '❌ OFF'}`);
        } catch (e) {
            return reply('❌ Could not read the schedule.');
        }
    }

    if (action === 'off' || action === 'disable') {
        try {
            await disableSchedule(from);
            return reply('✅ Group open/close schedule disabled.');
        } catch (e) {
            return reply('❌ Could not disable the schedule.');
        }
    }

    if (action !== 'close' && action !== 'open') {
        return reply(`❌ Use:\n${prefix}groupschedule close 22:00\n${prefix}groupschedule open 07:00\n${prefix}groupschedule status\n${prefix}groupschedule off`);
    }

    const time = normalizeTime(args?.[1]);
    if (!time) return reply(`❌ Invalid time. Use 24-hour format.\nExample: ${prefix}groupschedule ${action} 22:00`);

    try {
        const field = action === 'close' ? 'closeTime' : 'openTime';
        await setSchedule(from, number, { [field]: time, enabled: true, timezone: TIMEZONE });
        return reply(`✅ *Schedule updated.*\n\n${action === 'close' ? '🔒 Close' : '🔓 Open'}: ${time} daily\n🌍 Timezone: Asia/Karachi`);
    } catch (e) {
        console.error('[GROUP-SCHEDULE] Update error:', e);
        return reply('❌ Could not save the schedule. Please check the MongoDB connection.');
    }
});

// Scheduler: checks every 20 seconds, so execution is close to the requested minute.
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

                if (s.closeTime === hhmm && s.lastCloseKey !== dayKey) {
                    try {
                        await closeGroup(conn, s.groupJid);
                        await GroupSchedule.updateOne({ _id: s._id }, { $set: { lastCloseKey: dayKey } });
                        console.log(`🔒 [GROUP-SCHEDULE] Closed ${s.groupJid} at ${hhmm} ${TIMEZONE}`);
                    } catch (e) {
                        console.error('[GROUP-SCHEDULE] Close failed:', e.message);
                    }
                }

                if (s.openTime === hhmm && s.lastOpenKey !== dayKey) {
                    try {
                        await openGroup(conn, s.groupJid);
                        await GroupSchedule.updateOne({ _id: s._id }, { $set: { lastOpenKey: dayKey } });
                        console.log(`🔓 [GROUP-SCHEDULE] Opened ${s.groupJid} at ${hhmm} ${TIMEZONE}`);
                    } catch (e) {
                        console.error('[GROUP-SCHEDULE] Open failed:', e.message);
                    }
                }
            }
        } catch (e) {
            console.error('[GROUP-SCHEDULE] Scheduler error:', e.message);
        }
    }, 20000);
}
