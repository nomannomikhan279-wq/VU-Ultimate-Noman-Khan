// ============================================
// 🌙 VU ULTIMATE - DAILY GROUP SCHEDULE
// Close every managed group: 10:00 PM
// Open every managed group: 07:00 AM
// Timezone: Asia/Karachi
// ============================================

const { cmd } = require('../redx');

const TIMEZONE = 'Asia/Karachi';
const CLOSE_HOUR = 22;
const OPEN_HOUR = 7;
const CHECK_INTERVAL = 30 * 1000;

let lastRunKey = '';
let timerStarted = false;

function pakistanTime() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const get = type => parts.find(p => p.type === type)?.value || '';
    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        hour: Number(get('hour')),
        minute: Number(get('minute'))
    };
}

function botNumber(conn) {
    return String(conn?.user?.id || '').split(':')[0].split('@')[0];
}

function isBotAdmin(metadata, conn) {
    const number = botNumber(conn);
    const lid = String(conn?.authState?.creds?.me?.lid || '').split(':')[0].split('@')[0];
    return (metadata?.participants || []).some(p => {
        if (p.admin !== 'admin' && p.admin !== 'superadmin') return false;
        const id = String(p.id || '').split(':')[0].split('@')[0];
        return id === number || (lid && id === lid);
    });
}

async function updateAllGroups(shouldClose) {
    const sockets = global.activeSockets;
    if (!sockets || typeof sockets.values !== 'function') return;

    for (const conn of sockets.values()) {
        try {
            const groups = await conn.groupFetchAllParticipating();
            for (const jid of Object.keys(groups || {})) {
                try {
                    const metadata = groups[jid];
                    if (!isBotAdmin(metadata, conn)) continue;
                    await conn.groupSettingUpdate(jid, shouldClose ? 'announcement' : 'not_announcement');
                    console.log(`[Group Schedule] ${shouldClose ? 'Closed' : 'Opened'} ${metadata?.subject || jid}`);
                } catch (e) {
                    console.error(`[Group Schedule] Failed ${jid}: ${e.message}`);
                }
            }
        } catch (e) {
            console.error(`[Group Schedule] Could not fetch groups: ${e.message}`);
        }
    }
}

async function runSchedule() {
    const now = pakistanTime();
    if (now.minute !== 0) return;

    let action = null;
    if (now.hour === CLOSE_HOUR) action = 'close';
    if (now.hour === OPEN_HOUR) action = 'open';
    if (!action) return;

    const key = `${now.date}-${action}`;
    if (lastRunKey === key) return;
    lastRunKey = key;

    console.log(`[Group Schedule] ${action.toUpperCase()} schedule started at ${String(now.hour).padStart(2, '0')}:00 ${TIMEZONE}`);
    await updateAllGroups(action === 'close');
}

function startTimer() {
    if (timerStarted) return;
    timerStarted = true;
    setInterval(() => runSchedule().catch(e => console.error('[Group Schedule]', e.message)), CHECK_INTERVAL);
    runSchedule().catch(e => console.error('[Group Schedule]', e.message));
    console.log('🌙 VU ULTIMATE daily group schedule loaded: 10:00 PM close / 07:00 AM open (Asia/Karachi)');
}

// main.js exposes activeSockets before plugins are loaded.
startTimer();

cmd({
    pattern: 'groupschedule',
    alias: ['gschedule'],
    desc: 'Show the automatic daily group schedule',
    category: 'group',
    filename: __filename
}, async (conn, mek, m, ctx) => {
    if (!ctx?.isGroup) return m.reply('❌ This command can only be used in a group.');
    return m.reply('🌙 *Daily Group Schedule*\n\n🔒 Close: 10:00 PM\n🔓 Open: 7:00 AM\n🕐 Timezone: Asia/Karachi\n\nThe schedule runs automatically every day.');
});
