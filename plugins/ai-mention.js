// ============================================
// 🤖 AI MENTION + REPLY-TO-BOT - VU ULTIMATE
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

const norm = jid => String(jid || '').replace(/:\d+(?=@)/, '').toLowerCase().trim();
const num = jid => norm(jid).split('@')[0].replace(/[^0-9]/g, '');
function getKey() { return String(config.AI_API_KEY || process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(); }

function botIds(conn) {
    const ids = new Set();
    const add = j => { if (j) ids.add(norm(j)); };
    add(conn?.user?.id);
    add(conn?.authState?.creds?.me?.id);
    add(conn?.authState?.creds?.me?.lid);
    add(conn?.authState?.creds?.account?.lid);
    const n = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    if (n) { add(`${n}@s.whatsapp.net`); add(`${n}@lid`); }
    return ids;
}

function collectMentions(value, out = []) {
    if (!value || typeof value !== 'object') return out;
    if (Array.isArray(value)) { value.forEach(v => collectMentions(v, out)); return out; }
    if (Array.isArray(value.mentionedJid)) out.push(...value.mentionedJid);
    for (const [k, v] of Object.entries(value)) if (k !== 'mentionedJid' && v && typeof v === 'object') collectMentions(v, out);
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
    if (Array.isArray(value)) { for (const item of value) { const t = findText(item); if (t) return t; } return ''; }
    for (const t of [value.conversation, value.extendedTextMessage?.text, value.imageMessage?.caption, value.videoMessage?.caption, value.documentMessage?.caption, value.buttonsResponseMessage?.selectedDisplayText, value.listResponseMessage?.title]) {
        if (typeof t === 'string' && t.trim()) return t.trim();
    }
    for (const [k, v] of Object.entries(value)) if (k !== 'contextInfo' && k !== 'mentionedJid' && v && typeof v === 'object') { const t = findText(v); if (t) return t; }
    return '';
}

function getContextInfo(mek) {
    const msg = unwrapMessage(mek?.message || {});
    return msg.extendedTextMessage?.contextInfo ||
        msg.imageMessage?.contextInfo ||
        msg.videoMessage?.contextInfo ||
        msg.documentMessage?.contextInfo ||
        msg.buttonsResponseMessage?.contextInfo ||
        msg.listResponseMessage?.contextInfo || null;
}

function getQuotedMessage(mek) {
    const info = getContextInfo(mek);
    return info?.quotedMessage ? unwrapMessage(info.quotedMessage) : null;
}

function isReplyToBot(conn, mek) {
    if (!mek?.key?.remoteJid?.endsWith('@g.us')) return false;
    const info = getContextInfo(mek);
    if (!info?.quotedMessage) return false;
    const ids = botIds(conn);
    const quotedParticipant = norm(info.participant || '');
    if (ids.has(quotedParticipant)) return true;
    // Messages sent by this connection can have a quoted participant that is absent.
    // In that case WhatsApp's quoted key often carries the bot's own JID.
    const quotedKeyParticipant = norm(info?.quotedMessage?.key?.participant || '');
    return ids.has(quotedKeyParticipant);
}

function clean(text, conn) {
    let s = String(text || '');
    const botNumber = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    if (botNumber) s = s.replace(new RegExp(`(^|\\s)@${botNumber}(?=\\s|$|[.,!?])`, 'gi'), '$1 ');
    return s.replace(/\s+/g, ' ').trim();
}

function conversationKey(from, sender) { return `${norm(from)}:${norm(sender)}`; }

function makePrompt(question, old, repliedText) {
    const ctx = old.length ? `\nRecent conversation:\n${old.map(x => `${x.r}: ${x.t}`).join('\n')}` : '';
    const replyContext = repliedText ? `\nThe user is replying to your previous WhatsApp message. Previous message:\n${repliedText}\n` : '';
    return `You are VU ULTIMATE, a helpful WhatsApp group assistant. Answer directly and concisely. Match the user's English, Urdu, Roman Urdu or Hinglish. Help with programming, general knowledge, explanations, translations and calculations. If the user is replying to your previous message, understand that message as context and answer the user's follow-up. Do not unnecessarily mention being an AI.${ctx}${replyContext}\n\nUser question/follow-up:\n${question}`;
}

function extractText(data) {
    return (Array.isArray(data?.candidates) ? data.candidates : [])
        .flatMap(c => c?.content?.parts || [])
        .map(p => p?.text).filter(Boolean).join('').trim();
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

async function ask(question, old, repliedText) {
    const key = getKey();
    if (!key) throw Object.assign(new Error('AI_NOT_CONFIGURED'), { code: 'AI_NOT_CONFIGURED' });
    const configured = String(config.AI_MODEL || process.env.AI_MODEL || '').trim();
    const models = [...new Set([configured, 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-2.5-flash'].filter(Boolean))];
    const prompt = makePrompt(question, old, repliedText);
    let last;
    for (const model of models) {
        try { return await generateContent(key, model, prompt); }
        catch (e) { last = e; if (e.status !== 404) throw e; }
    }
    throw last || new Error('No supported Gemini model available');
}

async function handle(conn, mek, m, ctx) {
    if (!ctx?.isGroup || mek?.key?.fromMe || !ctx.from?.endsWith('@g.us')) return;

    const mentioned = isMentioned(conn, mek);
    const repliedToBot = isReplyToBot(conn, mek);
    if (!mentioned && !repliedToBot) return;

    // A reply to one of the bot's own messages is an AI trigger even without @mention.
    const message = unwrapMessage(mek.message);
    const question = clean(findText(message) || ctx.body || '', conn);
    const quotedMessage = repliedToBot ? getQuotedMessage(mek) : null;
    const quotedText = quotedMessage ? findText(quotedMessage) : '';
    const key = getKey();

    if (!question && !quotedText) {
        return conn.sendMessage(ctx.from, { text: 'Yes? 🤖 Ask me something.' }, { quoted: mek });
    }
    if (!key) {
        return conn.sendMessage(ctx.from, { text: '⚠️ AI is not configured. Add AI_API_KEY in Railway Variables, then redeploy.' }, { quoted: mek });
    }

    const sessionKey = conversationKey(ctx.from, ctx.sender || mek.key.participant || ctx.from);
    if (pending.has(sessionKey) || Date.now() - (cooldown.get(sessionKey) || 0) < COOLDOWN) return;
    cooldown.set(sessionKey, Date.now());
    pending.add(sessionKey);

    try {
        if (typeof conn.sendPresenceUpdate === 'function') await conn.sendPresenceUpdate('composing', ctx.from);
        const old = history.get(sessionKey) || [];
        const answer = await ask(question || 'Please respond to the message above.', old, quotedText);
        if (MAX_CONTEXT > 0) {
            old.push({ r: 'user', t: question || '(reply to previous message)' }, { r: 'assistant', t: answer });
            while (old.length > MAX_CONTEXT * 2) old.shift();
            history.set(sessionKey, old);
        }
        await conn.sendMessage(ctx.from, { text: answer }, { quoted: mek });
    } catch (error) {
        console.error(`[AI Mention/Reply] ${error?.status || error?.code || ''} ${error?.model || ''} ${error?.message || error}`);
        const text = error?.status === 404
            ? '❌ No compatible Gemini model is available for this API key/project. Please check your Gemini API key/project access.'
            : error?.status === 400 || error?.status === 403
                ? `❌ Gemini AI error (${error.status}). Check the API key/project permissions.`
                : '❌ AI service temporarily unavailable. Please try again.';
        await conn.sendMessage(ctx.from, { text }, { quoted: mek });
    } finally {
        pending.delete(sessionKey);
        if (typeof conn.sendPresenceUpdate === 'function') { try { await conn.sendPresenceUpdate('paused', ctx.from); } catch (_) {} }
    }
}

cmd({ on: 'body', desc: 'AI replies to bot mentions and replies to bot messages', category: 'ai', dontAddCommandList: true, filename: __filename }, handle);
console.log(`🤖 VU ULTIMATE - AI mention/reply handler loaded (${getKey() ? 'API key configured' : 'API key missing'})`);
