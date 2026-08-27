// ============================================
// 🤖 AI MENTION REPLY - VU ULTIMATE
// ============================================
const axios = require('axios');
const { cmd } = require('../redx');
const config = require('../config');

const KEY = String(config.AI_API_KEY || '').trim();
const MODEL = String(config.AI_MODEL || 'gemini-2.5-flash').trim();
const COOLDOWN = Math.max(1000, Number(config.AI_COOLDOWN_MS || 5000));
const MAX_CONTEXT = Math.min(12, Math.max(0, Number(config.AI_CONTEXT_MESSAGES || 6)));
const TIMEOUT = Math.min(60000, Math.max(5000, Number(config.AI_TIMEOUT_MS || 30000)));
const MAX_TOKENS = Math.min(2048, Math.max(128, Number(config.AI_MAX_OUTPUT_TOKENS || 700)));
const cooldown = new Map();
const history = new Map();
const pending = new Set();

const norm = jid => String(jid || '').replace(/:\d+(?=@)/, '').toLowerCase().trim();
const num = jid => norm(jid).split('@')[0].replace(/[^0-9]/g, '');

function botJids(conn) {
    const set = new Set();
    const add = j => j && set.add(norm(j));
    add(conn?.user?.id);
    add(conn?.authState?.creds?.me?.id);
    add(conn?.authState?.creds?.me?.lid);
    add(conn?.authState?.creds?.account?.lid);
    const n = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    if (n) add(`${n}@s.whatsapp.net`);
    return set;
}

// Recursively handles normal, ephemeral, view-once and other Baileys wrappers.
function mentionedJids(value, out = []) {
    if (!value || typeof value !== 'object') return out;
    if (Array.isArray(value)) return value.forEach(v => mentionedJids(v, out)), out;
    if (Array.isArray(value.mentionedJid)) out.push(...value.mentionedJid);
    for (const [k, v] of Object.entries(value)) {
        if (k !== 'mentionedJid' && v && typeof v === 'object') mentionedJids(v, out);
    }
    return out;
}

function mentioned(conn, mek) {
    if (!mek?.key?.remoteJid?.endsWith('@g.us')) return false;
    const ids = botJids(conn);
    const n = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    return mentionedJids(mek.message).some(j => ids.has(norm(j)) || (n && num(j) === n));
}

function textOf(v) {
    if (!v || typeof v !== 'object') return '';
    if (Array.isArray(v)) {
        for (const x of v) { const t = textOf(x); if (t) return t; }
        return '';
    }
    for (const t of [v.conversation, v.text, v.caption, v.extendedTextMessage?.text, v.imageMessage?.caption, v.videoMessage?.caption, v.documentMessage?.caption]) {
        if (typeof t === 'string' && t.trim()) return t.trim();
    }
    for (const [k, v2] of Object.entries(v)) {
        if (k !== 'contextInfo' && k !== 'mentionedJid' && v2 && typeof v2 === 'object') {
            const t = textOf(v2); if (t) return t;
        }
    }
    return '';
}

function clean(text, conn) {
    let s = String(text || '');
    const n = num(conn?.user?.id) || num(conn?.authState?.creds?.me?.id);
    if (n) s = s.replace(new RegExp(`(^|\\s)@${n}(?=\\s|$|[.,!?])`, 'gi'), '$1 ');
    return s.replace(/\s+/g, ' ').trim();
}

function key(from, sender) { return `${norm(from)}:${norm(sender)}`; }
function prompt(question, old) {
    const ctx = old.length ? `\nRecent context:\n${old.map(x => `${x.r}: ${x.t}`).join('\n')}` : '';
    return `You are VU ULTIMATE, a helpful WhatsApp group assistant. Answer directly and concisely. Match English, Urdu, Roman Urdu or Hinglish. Help with programming, knowledge, explanations, translations and calculations. Do not unnecessarily mention being an AI.${ctx}\n\nQuestion:\n${question}`;
}

async function ask(question, old) {
    if (!KEY) throw new Error('AI_NOT_CONFIGURED');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`;
    const res = await axios.post(url, {
        contents: [{ role: 'user', parts: [{ text: prompt(question, old) }] }],
        generationConfig: { maxOutputTokens: MAX_TOKENS, temperature: 0.4 }
    }, {
        timeout: TIMEOUT,
        headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' },
        validateStatus: () => true
    });
    if (res.status < 200 || res.status >= 300) throw Object.assign(new Error('AI_HTTP_ERROR'), { status: res.status });
    const answer = (res.data?.candidates || []).flatMap(c => c?.content?.parts || []).map(p => p?.text).filter(Boolean).join('').trim();
    if (!answer) throw new Error('AI_EMPTY_RESPONSE');
    return answer;
}

async function handle(conn, mek, m, ctx) {
    if (!ctx?.isGroup || ctx?.isCmd || mek?.key?.fromMe || !ctx.from?.endsWith('@g.us')) return;
    if (!mentioned(conn, mek)) return;

    const question = clean(textOf(mek.message) || ctx.body || '', conn);
    if (!question) return conn.sendMessage(ctx.from, { text: 'Yes? 🤖 Ask me something.' }, { quoted: mek });

    const k = key(ctx.from, ctx.sender || mek.key.participant || ctx.from);
    if (pending.has(k) || Date.now() - (cooldown.get(k) || 0) < COOLDOWN) return;
    cooldown.set(k, Date.now()); pending.add(k);

    try {
        if (typeof conn.sendPresenceUpdate === 'function') await conn.sendPresenceUpdate('composing', ctx.from);
        const old = history.get(k) || [];
        const answer = await ask(question, old);
        if (MAX_CONTEXT > 0) {
            old.push({ r: 'user', t: question }, { r: 'assistant', t: answer });
            while (old.length > MAX_CONTEXT * 2) old.shift();
            history.set(k, old);
        }
        await conn.sendMessage(ctx.from, { text: answer }, { quoted: mek });
    } catch (e) {
        if (config.DEBUG === 'true') console.error(`[AI Mention] failed: ${e?.status || e?.code || e?.message || 'unknown'}`);
        await conn.sendMessage(ctx.from, { text: '❌ AI service temporarily unavailable. Please try again.' }, { quoted: mek });
    } finally {
        pending.delete(k);
        if (typeof conn.sendPresenceUpdate === 'function') { try { await conn.sendPresenceUpdate('paused', ctx.from); } catch (_) {} }
    }
}

cmd({ on: 'body', desc: 'AI replies when the bot is mentioned in a group', category: 'ai', dontAddCommandList: true, filename: __filename }, handle);
console.log('🤖 VU ULTIMATE - AI mention handler loaded');
