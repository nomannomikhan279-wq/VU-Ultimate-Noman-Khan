// ============================================
// 🤖 AI MENTION - VU ULTIMATE
// ============================================
const axios = require('axios');
const { cmd } = require('../redx');
const config = require('../config');

const COOLDOWN = Math.max(1000, Number(config.AI_COOLDOWN_MS || 5000));
const MAX_CONTEXT = Math.min(12, Math.max(0, Number(config.AI_CONTEXT_MESSAGES || 6)));
const TIMEOUT = Math.min(60000, Math.max(5000, Number(config.AI_TIMEOUT_MS || 30000)));
const MAX_TOKENS = Math.min(4096, Math.max(128, Number(config.AI_MAX_OUTPUT_TOKENS || 700)));
const cooldown = new Map();
const history = new Map();
const pending = new Set();
// A WhatsApp message can occasionally be delivered to the body-event layer more than once.
// Keep a short-lived message-id lock so one incoming message can never create two Gemini calls.
const handledMessages = new Map();
const MESSAGE_LOCK_TTL = 2 * 60 * 1000;

const norm = jid => String(jid || '').replace(/:\d+(?=@)/, '').toLowerCase().trim();
const num = jid => norm(jid).split('@')[0].replace(/[^0-9]/g, '');
function getKey() {
    return String(config.AI_API_KEY || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function botIds(conn) {
    const ids = new Set();
    const add = j => { if (j) ids.add(norm(j)); };
    add(conn?.user?.id);
    add(conn?.authState?.creds?.me?.id);
    add(conn?.authState?.creds?.me?.lid);
    add(conn?.authState?.creds?.account?.lid);
    const n = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    if (n) {
        add(`${n}@s.whatsapp.net`);
        add(`${n}@lid`);
    }
    return ids;
}

function isBotAuthored(conn, mek, ctx) {
    if (mek?.key?.fromMe) return true;
    const ids = botIds(conn);
    const candidates = [
        mek?.key?.participant,
        mek?.key?.remoteJid,
        ctx?.sender,
        ctx?.senderNumber,
        ctx?.botNumber,
        ctx?.botNumber2
    ];
    return candidates.some(value => {
        if (!value) return false;
        const normalized = norm(value);
        if (ids.has(normalized)) return true;
        const n = num(value);
        return n && [...ids].some(id => num(id) === n);
    });
}

function collectMentions(value, out = []) {
    if (!value || typeof value !== 'object') return out;
    if (Array.isArray(value)) {
        value.forEach(v => collectMentions(v, out));
        return out;
    }
    if (Array.isArray(value.mentionedJid)) out.push(...value.mentionedJid);
    for (const [k, v] of Object.entries(value)) {
        if (k !== 'mentionedJid' && v && typeof v === 'object') collectMentions(v, out);
    }
    return out;
}

function isMentioned(conn, mek) {
    if (!mek?.key?.remoteJid?.endsWith('@g.us')) return false;
    const ids = botIds(conn);
    const botNumber = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    return collectMentions(mek.message).some(j => ids.has(norm(j)) || (botNumber && num(j) === botNumber));
}

function unwrapMessage(message) {
    let current = message;
    for (let i = 0; i < 8 && current && typeof current === 'object'; i++) {
        if (current.ephemeralMessage?.message) { current = current.ephemeralMessage.message; continue; }
        if (current.viewOnceMessage?.message) { current = current.viewOnceMessage.message; continue; }
        if (current.viewOnceMessageV2?.message) { current = current.viewOnceMessageV2.message; continue; }
        if (current.viewOnceMessageV2Extension?.message) { current = current.viewOnceMessageV2Extension.message; continue; }
        if (current.documentWithCaptionMessage?.message) { current = current.documentWithCaptionMessage.message; continue; }
        break;
    }
    return current || message;
}

function findText(value) {
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
        for (const item of value) {
            const t = findText(item);
            if (t) return t;
        }
        return '';
    }
    for (const t of [
        value.conversation,
        value.extendedTextMessage?.text,
        value.imageMessage?.caption,
        value.videoMessage?.caption,
        value.documentMessage?.caption,
        value.buttonsResponseMessage?.selectedDisplayText,
        value.listResponseMessage?.title
    ]) {
        if (typeof t === 'string' && t.trim()) return t.trim();
    }
    for (const [k, v] of Object.entries(value)) {
        if (k !== 'contextInfo' && k !== 'mentionedJid' && v && typeof v === 'object') {
            const t = findText(v);
            if (t) return t;
        }
    }
    return '';
}

function clean(text, conn) {
    let s = String(text || '');
    const botNumber = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    if (botNumber) s = s.replace(new RegExp(`(^|\\s)@${botNumber}(?=\\s|$|[.,!?])`, 'gi'), '$1 ');
    return s.replace(/\\s+/g, ' ').trim();
}

function conversationKey(from, sender) {
    return `${norm(from)}:${norm(sender)}`;
}

function makePrompt(question, old) {
    const ctx = old.length ? `\\nRecent conversation:\\n${old.map(x => `${x.r}: ${x.t}`).join('\\n')}` : '';
    return `You are VU ULTIMATE, a helpful WhatsApp group assistant. Answer directly and concisely. Match the user's English, Urdu, Roman Urdu or Hinglish. Help with programming, general knowledge, explanations, translations and calculations. Do not unnecessarily mention being an AI.${ctx}\\n\\nUser question:\\n${question}`;
}

function extractText(data) {
    return (Array.isArray(data?.candidates) ? data.candidates : [])
        .flatMap(c => c?.content?.parts || [])
        .map(p => p?.text)
        .filter(Boolean)
        .join('')
        .trim();
}

async function generateContent(key, model, prompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await axios.post(url, {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS }
    }, {
        timeout: TIMEOUT,
        headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        validateStatus: () => true
    });
    const answer = extractText(response.data);
    if (response.status >= 200 && response.status < 300 && answer) return answer;
    const err = new Error(response.data?.error?.message || `Gemini HTTP ${response.status}`);
    err.status = response.status;
    err.model = model;
    throw err;
}

async function ask(question, old) {
    const key = getKey();
    if (!key) throw Object.assign(new Error('AI_NOT_CONFIGURED'), { code: 'AI_NOT_CONFIGURED' });
    const configured = String(config.AI_MODEL || process.env.AI_MODEL || '').trim();
    const models = [...new Set([configured, 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean))];
    const prompt = makePrompt(question, old);
    let last;
    for (const model of models) {
        try { return await generateContent(key, model, prompt); }
        catch (e) { last = e; if (e.status !== 404) throw e; }
    }
    throw last || new Error('No supported Gemini model available');
}

function lockMessage(mek) {
    const id = String(mek?.key?.id || '').trim();
    if (!id) return true;
    const now = Date.now();
    for (const [key, time] of handledMessages) {
        if (now - time > MESSAGE_LOCK_TTL) handledMessages.delete(key);
    }
    if (handledMessages.has(id)) return false;
    handledMessages.set(id, now);
    return true;
}

async function handle(conn, mek, m, ctx) {
    // Hard stop for messages authored by the bot itself. This protects against
    // WhatsApp/Baileys messages whose fromMe flag is missing or unreliable.
    if (!ctx?.isGroup || !ctx.from?.endsWith('@g.us') || isBotAuthored(conn, mek, ctx)) return;

    // AI only responds to an explicit @mention. Reply-to-bot was intentionally
    // removed because it can create self-reply loops when WhatsApp echoes bot messages.
    if (!isMentioned(conn, mek)) return;

    // Prevent duplicate deliveries of the same WhatsApp message from starting
    // another Gemini request (the duplicate request was causing a late fallback error).
    if (!lockMessage(mek)) return;

    const question = clean(findText(unwrapMessage(mek.message)) || ctx.body || '', conn);
    if (!question) return conn.sendMessage(ctx.from, { text: 'Yes? 🤖 Ask me something.' }, { quoted: mek });

    const key = getKey();
    if (!key) return conn.sendMessage(ctx.from, {
        text: '⚠️ AI is not configured. Add AI_API_KEY in Railway Variables, then redeploy.'
    }, { quoted: mek });

    const sender = ctx.sender || mek.key.participant || ctx.from;
    const sessionKey = conversationKey(ctx.from, sender);
    if (pending.has(sessionKey) || Date.now() - (cooldown.get(sessionKey) || 0) < COOLDOWN) return;
    cooldown.set(sessionKey, Date.now());
    pending.add(sessionKey);

    try {
        if (typeof conn.sendPresenceUpdate === 'function') await conn.sendPresenceUpdate('composing', ctx.from);
        const old = history.get(sessionKey) || [];
        const answer = await ask(question, old);
        if (MAX_CONTEXT > 0) {
            old.push({ r: 'user', t: question }, { r: 'assistant', t: answer });
            while (old.length > MAX_CONTEXT * 2) old.shift();
            history.set(sessionKey, old);
        }
        await conn.sendMessage(ctx.from, { text: answer }, { quoted: mek });
    } catch (error) {
        console.error(`[AI Mention] ${error?.status || error?.code || ''} ${error?.model || ''} ${error?.message || error}`);
        const text = error?.status === 404
            ? '❌ No compatible Gemini model is available for this API key/project.'
            : error?.status === 400 || error?.status === 403
                ? `❌ Gemini AI error (${error.status}). Check the API key/project permissions.`
                : '❌ AI service temporarily unavailable. Please try again.';
        await conn.sendMessage(ctx.from, { text }, { quoted: mek });
    } finally {
        pending.delete(sessionKey);
        if (typeof conn.sendPresenceUpdate === 'function') {
            try { await conn.sendPresenceUpdate('paused', ctx.from); } catch (_) {}
        }
    }
}

cmd({
    on: 'body',
    desc: 'AI replies only to explicit bot mentions',
    category: 'ai',
    dontAddCommandList: true,
    filename: __filename
}, handle);

console.log(`🤖 VU ULTIMATE - AI mention handler loaded (${getKey() ? 'API key configured' : 'API key missing'})`);
