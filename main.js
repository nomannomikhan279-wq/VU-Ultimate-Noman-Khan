// ============================================
// 🌸 VU ULTIMATE - FIXED MAIN.JS
// 👑 Developer: Noman Khan
// ============================================

const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    jidNormalizedUser,
    Browsers,
    DisconnectReason,
    jidDecode,
    downloadContentFromMessage,
    getContentType,
} = require('@whiskeysockets/baileys');

const config = require('./config');
const { sms } = require('./lib/msg');
const events = require('./redx');

const {
    connectdb,
    saveSessionToMongoDB,
    getSessionFromMongoDB,
    deleteSessionFromMongoDB,
    getUserConfigFromMongoDB,
    updateUserConfigInMongoDB,
    addNumberToMongoDB,
    removeNumberFromMongoDB,
    getAllNumbersFromMongoDB,
    saveOTPToMongoDB,
    verifyOTPFromMongoDB,
    incrementStats,
    getStatsForNumber
} = require('./lib/database');

const { handleAntidelete } = require('./lib/antidelete');
const { redxminibot, autoReactChannel, autoHandleStatus, reactToChannelPost, CHANNEL_IDS, REACT_EMOJIS } = require('./lib/system');
const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');
const chalk = require('chalk');
const GroupEvents = require('./lib/groupevents');
const { PresenceControl, BotActivityFilter } = require('./data/presence');
const registerAntiCall = require('./lib/anticall');
const { getPrefix } = require('./lib/prefix');
const { handleReaction } = require('./lib/reaction');
const { fakevCard } = require('./lib/fakevCard');
const AntiDelete = require('./lib/antidelete');

const prefix = config.PREFIX || '.';
const mode = config.MODE || config.WORK_TYPE || 'public';
const BOT_NAME = config.BOT_NAME || 'VU ULTIMATE';
const OWNER_NAME = config.OWNER_NAME || 'Noman Khan';
const OWNER_NUMBER = config.OWNER_NUMBER || [];
const CHANNEL_JID = config.CHANNEL_JID || '120363411977621625@newsletter';
const AUTO_CHANNEL_REACT_EMOJIS = config.AUTO_CHANNEL_REACT_EMOJIS || ['❤️', '🔥', '👑', '💯', '😍', '💖', '✨'];
const router = express.Router();
connectdb();

class SmartCache {
    constructor(maxSize = 300, cleanupInterval = 180000) { this.cache = new Map(); this.maxSize = maxSize; this.hits = 0; this.misses = 0; this.statsInterval = setInterval(() => this.logStats(), 1800000); this.cleanupInterval = setInterval(() => this.cleanupOld(), cleanupInterval); }
    set(key, value, ttl = 3600000) { if (this.cache.size >= this.maxSize) this.evictLRU(); this.cache.set(key, { value, timestamp: Date.now(), ttl, lastAccess: Date.now() }); }
    get(key) { const item = this.cache.get(key); if (!item) { this.misses++; return null; } if (Date.now() - item.timestamp > item.ttl) { this.cache.delete(key); this.misses++; return null; } item.lastAccess = Date.now(); this.hits++; return item.value; }
    delete(key) { this.cache.delete(key); }
    clear() { this.cache.clear(); this.hits = 0; this.misses = 0; }
    evictLRU() { if (!this.cache.size) return; let k = null, t = Date.now(); for (const [key, value] of this.cache.entries()) if (value.lastAccess < t) { t = value.lastAccess; k = key; } if (k) this.cache.delete(k); }
    cleanupOld() { const now = Date.now(); let deleted = 0; for (const [key, value] of this.cache.entries()) if (now - value.timestamp > value.ttl) { this.cache.delete(key); deleted++; } if (deleted && config.DEBUG === 'true') console.log(chalk.gray(`[ 🧹 ] Cache cleaned: ${deleted} expired`)); }
    logStats() { const total = this.hits + this.misses; if (!total) return; console.log(chalk.gray(`[ 📊 ] Cache: ${this.cache.size}/${this.maxSize} | Hit: ${Math.round((this.hits / total) * 100)}%`)); this.hits = 0; this.misses = 0; }
}
const messageCache = new SmartCache(300, 180000);
const groupMetaCache = new SmartCache(100, 300000);
const userCache = new SmartCache(200, 300000);
const activeSockets = new Map();
const socketCreationTime = new Map();
const processedMessages = new Set();
const RATE_LIMIT = 5, RATE_WINDOW = 1000;
const userMessageCounts = new Map();
function checkRateLimit(senderNumber) { const now = Date.now(); const d = userMessageCounts.get(senderNumber) || { count: 0, timestamp: now }; if (now - d.timestamp > RATE_WINDOW) { d.count = 1; d.timestamp = now; } else d.count++; userMessageCounts.set(senderNumber, d); return d.count <= RATE_LIMIT; }
function createStore() { const store = { messages: {}, bind(ev) { ev.on('messages.upsert', ({ messages }) => { for (const msg of messages) { const jid = msg.key && msg.key.remoteJid; if (!jid) continue; if (!store.messages[jid]) store.messages[jid] = []; store.messages[jid].push(msg); if (store.messages[jid].length > 200) store.messages[jid].shift(); } }); }, async loadMessage(jid, id) { return store.messages[jid]?.find(m => m.key?.id === id) || null; } }; return store; }
const createSerial = size => crypto.randomBytes(size).toString('hex').slice(0, size);
function getGroupAdmins(participants) { return (participants || []).filter(i => i.admin === 'admin' || i.admin === 'superadmin').map(i => i.id); }
function cleanNumber(number) { return String(number || '').replace(/[^0-9]/g, ''); }
function getBotNumber(socket) { try { const id = socket?.user?.id; return id ? cleanNumber(id.includes(':') ? id.split(':')[0] : id.split('@')[0]) : ''; } catch { return ''; } }
function getBotJid(socket) { const n = getBotNumber(socket); return n ? `${n}@s.whatsapp.net` : ''; }
function isNumberAlreadyConnected(number) { return activeSockets.has(String(number).replace(/[^0-9]/g, '')); }
function getConnectionStatus(number) { const n = String(number).replace(/[^0-9]/g, ''); const t = socketCreationTime.get(n); return { isConnected: activeSockets.has(n), connectionTime: t ? new Date(t).toLocaleString() : null, uptime: t ? Math.floor((Date.now() - t) / 1000) : 0 }; }
function redxLog(message, type = 'info') { const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' }; console.log(`${icons[type] || '📝'} [VU ULTIMATE-MINI] ${new Date().toISOString()}: ${message}`); }

const pluginsDir = path.join(__dirname, 'plugins');
if (!fs.existsSync(pluginsDir)) fs.mkdirSync(pluginsDir, { recursive: true });
const pluginFiles = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js'));
redxLog(`Loading ${pluginFiles.length} plugins...`, 'info');
for (const file of pluginFiles) { try { require(path.join(pluginsDir, file)); } catch (e) { redxLog(`Failed to load plugin ${file}: ${e.message}`, 'error'); } }

function extractMessageBody(mek) {
    const msg = mek?.message || {};
    if (msg.conversation) return msg.conversation;
    if (msg.extendedTextMessage?.text) return msg.extendedTextMessage.text;
    if (msg.imageMessage?.caption) return msg.imageMessage.caption;
    if (msg.videoMessage?.caption) return msg.videoMessage.caption;
    if (msg.documentMessage?.caption) return msg.documentMessage.caption;
    if (msg.listResponseMessage?.singleSelectReply?.selectedRowId) return msg.listResponseMessage.singleSelectReply.selectedRowId;
    if (msg.buttonsResponseMessage?.selectedButtonId) return msg.buttonsResponseMessage.selectedButtonId;
    if (msg.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) { try { const p = JSON.parse(msg.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson); return p.id || p.selected_id || ''; } catch (_) {} }
    if (msg.templateButtonReplyMessage?.selectedId) return msg.templateButtonReplyMessage.selectedId;
    return '';
}
function extractButtonId(mek) { try { const msg = mek.message || {}, i = msg.interactiveResponseMessage; if (!i) return null; if (i.nativeFlowResponseMessage?.paramsJson) { try { const p = JSON.parse(i.nativeFlowResponseMessage.paramsJson); return p.id || p.selected_id || null; } catch (_) {} } return i.singleSelectResponse?.selectedRowId || i.buttonResponse?.selectedButtonId || msg.templateButtonReplyMessage?.selectedId || null; } catch { return null; } }
function findCommand(cmdName) { try { const name = String(cmdName || '').trim().toLowerCase(); return events.commands.find(c => String(c.pattern || '').toLowerCase() === name || (c.alias || []).map(a => String(a).toLowerCase()).includes(name)); } catch { return null; } }

async function handleReactDirect(adminNumber, channelId, postId, emojis, count) { const users = Array.from(activeSockets.keys()).filter(u => u !== adminNumber); const selected = count && parseInt(count) > 0 ? users.sort(() => .5 - Math.random()).slice(0, Math.min(parseInt(count), users.length)) : users; if (!selected.length) return { error: 'No other users available to react' }; const channelJid = channelId.includes('@') ? channelId : `${channelId}@newsletter`; const fullPostId = postId.includes('_') ? postId : `${channelId}_${postId}`; const results = []; let successCount = 0, failCount = 0; for (const n of selected) { try { const socket = activeSockets.get(n); const emoji = emojis[Math.floor(Math.random() * emojis.length)]; await socket.sendMessage(channelJid, { react: { text: emoji, key: { remoteJid: channelJid, id: fullPostId, participant: jidNormalizedUser(socket.user.id) } } }); results.push({ number: n, status: 'success', emoji }); successCount++; await delay(500); } catch (e) { results.push({ number: n, status: 'failed', error: e.message }); failCount++; } } return { channelId, postId, emojis, totalUsers: users.length, reactingUsers: selected.length, successCount, failCount, results }; }
async function handleVoteDirect(adminNumber, pollId, option, count) { const users = Array.from(activeSockets.keys()).filter(u => u !== adminNumber); const selected = count && parseInt(count) > 0 ? users.sort(() => .5 - Math.random()).slice(0, Math.min(parseInt(count), users.length)) : users; if (!selected.length) return { error: 'No other users available to vote' }; let pollJid = pollId, pollMessageId = pollId; if (pollId.includes('_')) { const p = pollId.split('_'); if (p.length === 2) [pollJid, pollMessageId] = p; } if (!pollJid.includes('@')) pollJid = `${pollJid}@g.us`; const results = []; let successCount = 0, failCount = 0; for (const n of selected) { try { const socket = activeSockets.get(n); await socket.sendMessage(pollJid, { pollVote: { key: { remoteJid: pollJid, id: pollMessageId }, selected: [parseInt(option)] } }); results.push({ number: n, status: 'success', option: parseInt(option) }); successCount++; await delay(500); } catch (e) { results.push({ number: n, status: 'failed', error: e.message }); failCount++; } } return { pollId, option: parseInt(option), totalUsers: users.length, votingUsers: selected.length, successCount, failCount, results }; }

async function autoFollowChannel(conn, userJid) { if (config.AUTO_FOLLOW_CHANNEL !== 'true') return; try { await conn.sendMessage(CHANNEL_JID, { follow: {} }); redxLog(`[Channel] ${userJid} followed channel`, 'success'); } catch (e) { console.error('[Channel] Follow error:', e.message); } }

async function redxPair(number, res = null) {
    let connectionLockKey; const sanitizedNumber = String(number).replace(/[^0-9]/g, '');
    try {
        const sessionPath = path.join(__dirname, 'session', `session_${sanitizedNumber}`);
        if (isNumberAlreadyConnected(sanitizedNumber)) { const s = getConnectionStatus(sanitizedNumber); if (res && !res.headersSent) return res.json({ status: 'already_connected', message: 'Number is already connected', connectionTime: s.connectionTime, uptime: `${s.uptime} seconds` }); return; }
        connectionLockKey = `redx_lock_${sanitizedNumber}`; if (global[connectionLockKey]) { if (res && !res.headersSent) return res.json({ status: 'connection_in_progress' }); return; } global[connectionLockKey] = true;
        const existingSession = await getSessionFromMongoDB(sanitizedNumber);
        if (!existingSession) { if (fs.existsSync(sessionPath)) await fs.remove(sessionPath); } else { fs.ensureDirSync(sessionPath); fs.writeFileSync(path.join(sessionPath, 'creds.json'), JSON.stringify(existingSession, null, 2)); }
        const { state, saveCreds } = await useMultiFileAuthState(sessionPath); const logger = pino({ level: 'silent' }); const store = createStore();
        const conn = makeWASocket({ auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) }, printQRInTerminal: false, logger, connectTimeoutMs: 60000, defaultQueryTimeoutMs: 0, keepAliveIntervalMs: 10000, emitOwnEvents: false, fireInitQueries: true, generateHighQualityLinkPreview: true, syncFullHistory: true, markOnlineOnConnect: true, browser: ['Mac OS', 'Safari', '10.15.7'], getMessage: async key => store.loadMessage(key.remoteJid, key.id) || { conversation: BOT_NAME } });
        socketCreationTime.set(sanitizedNumber, Date.now()); activeSockets.set(sanitizedNumber, conn); store.bind(conn.ev); setupCallHandlers(conn, number); setupAutoRestart(conn, number);
        conn.decodeJid = jid => { if (!jid) return jid; if (/:\d+@/gi.test(jid)) { const d = jidDecode(jid) || {}; return d.user && d.server ? `${d.user}@${d.server}` : jid; } return jid; };
        conn.downloadAndSaveMediaMessage = async (message, filename, attachExtension = true) => { const quoted = message.msg || message; const mime = quoted.mimetype || ''; const typeName = message.mtype ? message.mtype.replace(/Message/gi, '') : mime.split('/')[0]; const stream = await downloadContentFromMessage(quoted, typeName); let buffer = Buffer.alloc(0); for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]); const type = await FileType.fromBuffer(buffer); const out = attachExtension ? `${filename}.${type?.ext || 'bin'}` : filename; fs.writeFileSync(out, buffer); return out; };
        if (!state.creds.registered) { try { await delay(1500); const code = await conn.requestPairingCode(sanitizedNumber); if (res && !res.headersSent) res.send({ code, status: 'new_pairing' }); } catch (e) { if (res && !res.headersSent) res.status(500).send({ error: 'Failed to get pairing code', status: 'error' }); throw e; } } else if (res && !res.headersSent) res.json({ status: 'reconnecting', message: 'Reconnecting with existing session' });
        conn.ev.on('creds.update', async () => { await saveCreds(); try { const creds = JSON.parse(await fs.readFile(path.join(sessionPath, 'creds.json'), 'utf8')); await saveSessionToMongoDB(sanitizedNumber, creds); } catch (e) { redxLog(`Credential save error: ${e.message}`, 'error'); } });
        conn.ev.on('messages.update', async updates => { try { if (config.ANTIDELETE === 'true') await handleAntidelete(conn, updates, store, getBotNumber(conn)); } catch (e) { console.error('[ANTIDELETE ERROR]', e.message); } });
        conn.ev.on('connection.update', async update => { const { connection, lastDisconnect } = update; if (connection === 'open') { redxLog(`Connected: ${sanitizedNumber}`, 'success'); await addNumberToMongoDB(sanitizedNumber); try { await redxminibot(conn); } catch (_) {} } if (connection === 'close') { const reason = lastDisconnect?.error?.output?.statusCode; if (reason === DisconnectReason.loggedOut) redxLog('Session logged out.', 'error'); } });
        conn.ev.on('messages.upsert', async msg => {
            try {
                const mek = msg.messages?.[0]; if (!mek?.message) return;
                await autoReactChannel(conn, mek);
                if (mek.key.remoteJid === 'status@broadcast') { await autoHandleStatus(conn, mek); return; }
                if (mek.key.id) messageCache.set(mek.key.id, mek);
                if (config.READ_MESSAGE === 'true') await conn.readMessages([mek.key]);
                const buttonId = extractButtonId(mek);
                if (buttonId) { const cmd = findCommand(buttonId); if (cmd) { const from = mek.key.remoteJid, m = sms(conn, mek), isGroup = from.endsWith('@g.us'), sender = mek.key.fromMe ? getBotJid(conn) : (mek.key.participant || from), groupMetadata = isGroup ? await getCachedGroupMetadata(conn, from) : {}, participants = groupMetadata.participants || [], groupAdmins = getGroupAdmins(participants); await cmd.function(conn, mek, m, { from, body: buttonId, isCmd: true, command: buttonId, args: [], q: '', text: '', isGroup, sender, senderNumber: cleanNumber(sender), botNumber: getBotNumber(conn), pushname: mek.pushName || 'User', isMe: mek.key.fromMe, isOwner: OWNER_NUMBER.includes(cleanNumber(sender)) || mek.key.fromMe, isCreator: OWNER_NUMBER.includes(cleanNumber(sender)) || mek.key.fromMe, groupMetadata, groupName: groupMetadata.subject || '', participants, groupAdmins, isBotAdmins: groupAdmins.some(a => cleanNumber(a) === getBotNumber(conn)), isAdmins: groupAdmins.some(a => cleanNumber(a) === cleanNumber(sender)), reply: text => conn.sendMessage(from, { text }, { quoted: mek }) }); return; } }
                const m = sms(conn, mek), from = mek.key.remoteJid, isGroup = from.endsWith('@g.us'), botJid = getBotJid(conn), sender = mek.key.fromMe ? botJid : (mek.key.participant || from), senderNumber = cleanNumber(sender), botNumber = getBotNumber(conn), isMe = mek.key.fromMe || sender === botJid, isOwner = OWNER_NUMBER.includes(senderNumber) || isMe;
                const groupMetadata = isGroup ? await getCachedGroupMetadata(conn, from) : {}, groupName = groupMetadata.subject || '', participants = groupMetadata.participants || [], groupAdmins = getGroupAdmins(participants), isBotAdmins = groupAdmins.some(a => cleanNumber(a) === botNumber), isAdmins = groupAdmins.some(a => cleanNumber(a) === senderNumber);
                const body = extractMessageBody(mek), isCmd = body.startsWith(prefix);
                if (!mek.message?.reactionMessage && config.CUSTOM_REACT === 'true') m.react((config.CUSTOM_REACT_EMOJIS || '🥲,😂,👍🏻,🙂,😔').split(',')[Math.floor(Math.random() * (config.CUSTOM_REACT_EMOJIS || '🥲,😂,👍🏻,🙂,😔').split(',').length)]);
                if (mek.message?.reactionMessage) handleReaction(m, true, senderNumber, botNumber, config);
                let bannedUsers = []; try { if (fs.existsSync('./lib/ban.json')) bannedUsers = JSON.parse(fs.readFileSync('./lib/ban.json', 'utf8')); if (!Array.isArray(bannedUsers)) bannedUsers = []; } catch (_) {}
                if (bannedUsers.includes(senderNumber) && !isOwner) return;
                if (from !== 'status@broadcast') { if (mode === 'private' && !isOwner) return; if (mode === 'inbox' && !isGroup && !isOwner) return; if (mode === 'groups' && !isGroup && !isOwner) return; }
                if (isCmd) { const cmdName = body.slice(prefix.length).trim().split(' ')[0].toLowerCase(); const cmd = findCommand(cmdName); if (cmd) { try { const args = body.trim().split(/ +/).slice(1), q = args.join(' '); await cmd.function(conn, mek, m, { from, body, isCmd, command: cmdName, args, q, text: q, isGroup, sender, senderNumber, botNumber, pushname: mek.pushName || 'User', isMe, isOwner, isCreator: isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply: text => conn.sendMessage(from, { text }, { quoted: mek }) }); } catch (e) { console.error('[ ❌ ] Command error', e.message); } } else if (config.SEND_UNKNOWN_COMMAND === 'true' && isOwner) await m.reply(`❌ Command not found: ${cmdName}\nUse ${prefix}menu to see all commands`); }
                for (const command of events.commands) { if (command.on !== 'body') continue; try { await command.function(conn, mek, m, { from, body, isCmd, isGroup, sender, senderNumber, botNumber, pushname: mek.pushName || 'User', isMe, isOwner, isCreator: isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply: text => conn.sendMessage(from, { text }, { quoted: mek }) }); } catch (e) { console.error(`[ ❌ ] Event error (${command.filename || 'plugin'}):`, e.message); } }
            } catch (e) { console.error('[ ❌ ] Message handler error:', e.message); }
        });
    } catch (err) { redxLog(`VU ULTIMATE Pair error: ${err.message}`, 'error'); if (res && !res.headersSent) res.json({ error: 'Internal Server Error' }); }
    finally { if (connectionLockKey) global[connectionLockKey] = false; }
}

async function getCachedGroupMetadata(conn, jid) { try { let metadata = groupMetaCache.get(jid); if (!metadata) { metadata = await conn.groupMetadata(jid); metadata.participants = metadata.participants || []; groupMetaCache.set(jid, metadata, 300000); } return metadata; } catch (e) { return { participants: [], subject: 'Unknown', id: jid }; } }
async function setupCallHandlers(socket, number) { registerAntiCall(socket, config); socket.ev.on('call', async calls => { try { const uc = await getUserConfigFromMongoDB(number); if (uc.ANTI_CALL !== 'true') return; for (const call of calls) if (call.status === 'offer') { await socket.rejectCall(call.id, call.from); await socket.sendMessage(call.from, { text: uc.REJECT_MSG || config.REJECT_MSG }); } } catch (e) { redxLog(`Anti-call error: ${e.message}`, 'error'); } }); }
function setupAutoRestart(socket, number) { let attempts = 0; socket.ev.on('connection.update', async update => { const { connection, lastDisconnect } = update; if (connection === 'open') attempts = 0; if (connection !== 'close') return; const status = lastDisconnect?.error?.output?.statusCode; if (status === 401) return; if (status === 408) return; if (attempts >= 3) return; attempts++; const n = String(number).replace(/[^0-9]/g, ''); activeSockets.delete(n); socketCreationTime.delete(n); socket.ev.removeAllListeners(); await delay(10000); try { await redxPair(number, { headersSent: false, json() {}, status() { return this; } }); } catch (e) { redxLog(`Reconnection failed: ${e.message}`, 'error'); } }); }

router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'pair.html')));
router.get('/code', async (req, res) => { if (!req.query.number) return res.json({ error: 'Number required' }); await redxPair(req.query.number, res); });
router.get('/status', (req, res) => { const { number } = req.query; if (!number) return res.json({ totalActive: activeSockets.size, connections: Array.from(activeSockets.keys()) }); const s = getConnectionStatus(number); res.json({ number, ...s }); });
router.get('/active', (req, res) => res.json({ count: activeSockets.size, numbers: Array.from(activeSockets.keys()) }));
router.get('/ping', (req, res) => res.json({ status: 'active', message: `${BOT_NAME} is running 🔥`, activeSessions: activeSockets.size }));
router.get('/disconnect', async (req, res) => { const n = String(req.query.number || '').replace(/[^0-9]/g, ''); const socket = activeSockets.get(n); if (!socket) return res.status(404).json({ error: 'Not found' }); try { await socket.ws.close(); socket.ev.removeAllListeners(); activeSockets.delete(n); socketCreationTime.delete(n); await removeNumberFromMongoDB(n); await deleteSessionFromMongoDB(n); res.json({ status: 'success' }); } catch (e) { res.status(500).json({ error: 'Failed to disconnect' }); } });

async function autoReconnectFromMongoDB() { try { const numbers = await getAllNumbersFromMongoDB(); for (const n of numbers) if (!activeSockets.has(n)) { await redxPair(n, { headersSent: false, json() {}, status() { return this; } }); await delay(2000); } } catch (e) { redxLog(`autoReconnectFromMongoDB error: ${e.message}`, 'error'); } }
setTimeout(autoReconnectFromMongoDB, 3000);
process.on('uncaughtException', err => redxLog(`Uncaught exception: ${err.message}`, 'error'));
module.exports = router;
