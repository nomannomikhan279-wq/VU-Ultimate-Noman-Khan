// ============================================
// 🤖 AI MENTION REPLY - VU ULTIMATE
// Replies only when the bot is actually mentioned in a group.
// ============================================

const axios = require('axios');
const { cmd } = require('../redx');
const config = require('../config');

const AI_API_KEY = config.AI_API_KEY;
const AI_MODEL = config.AI_MODEL;
const AI_API_URL = config.AI_API_URL;
const AI_COOLDOWN_MS = Math.min(60000, Math.max(1000, Number(config.AI_COOLDOWN_MS || 5000)));
const AI_CONTEXT_MESSAGES = Math.min(12, Math.max(0, Number(config.AI_CONTEXT_MESSAGES || 6)));
const AI_TIMEOUT_MS = Math.min(60000, Math.max(5000, Number(config.AI_TIMEOUT_MS || 30000)));

const cooldowns = new Map();
const conversations = new Map();
const pending = new Set();

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim().toLowerCase();
}

function jidNumber(jid) {
    return normalizeJid(jid).split('@')[0].replace(/[^0-9]/g, '');
}

function getBotJids(conn) {
    const ids = new Set();
    const raw = conn?.user?.id || '';
    const normalized = normalizeJid(raw);
    if (normalized) ids.add(normalized);
    const number = jidNumber(raw);
    if (number) ids.add(`${number}@s.whatsapp.net`);
    return ids;
}

function getMentionedJids(mek) {
    const message = mek?.message || {};
    const contexts = [
        message.extendedTextMessage?.contextInfo,
        message.imageMessage?.contextInfo,
        message.videoMessage?.contextInfo,
        message.documentMessage?.contextInfo,
        message.buttonsResponseMessage?.contextInfo,
        message.listResponseMessage?.contextInfo,
        message.templateButtonReplyMessage?.contextInfo,
        message.interactiveResponseMessage?.contextInfo
    ];

    return contexts.flatMap(info => Array.isArray(info?.mentionedJid) ? info.mentionedJid : []);
}

function isBotMentioned(conn, mek) {
    if (!mek?.key?.remoteJid?.endsWith('@g.us')) return false;
    const botJids = getBotJids(conn);
    const botNumber = jidNumber(conn?.user?.id);
    return getMentionedJids(mek).some(jid => {
        const normalized = normalizeJid(jid);
        return botJids.has(normalized) || (botNumber && jidNumber(jid) === botNumber);
    });
}

function getMessageText(mek) {
    const msg = mek?.message || {};
    return msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        msg.documentMessage?.caption || '';
}

function cleanMention(text, conn) {
    let result = String(text || '');
    const botNumber = jidNumber(conn?.user?.id);
    if (botNumber) {
        result = result.replace(new RegExp(`@${botNumber}(?=\\s|$)`, 'gi'), ' ');
    }
    return result.replace(/\s+/g, ' ').trim();
}

function conversationKey(from, sender) {
    return `${normalizeJid(from)}:${normalizeJid(sender)}`;
}

function getHistory(key) {
    return conversations.get(key) || [];
}

function saveTurn(key, user, assistant) {
    if (AI_CONTEXT_MESSAGES <= 0) return;
    const history = getHistory(key);
    history.push({ role: 'user', text: user }, { role: 'assistant', text: assistant });
    while (history.length > AI_CONTEXT_MESSAGES * 2) history.shift();
    conversations.set(key, history);
}

function buildPrompt(question, history) {
    const context = history.length
        ? `\nRecent conversation:\n${history.map(x => `${x.role}: ${x.text}`).join('\n')}`
        : '';

    return `You are VU ULTIMATE, a helpful WhatsApp group assistant.
Answer directly and concisely by default.
Match the user's language: English, Urdu, Roman Urdu, or Hinglish.
Help with programming, general knowledge, explanations, translations and calculations.
Use useful formatting when appropriate. Do not unnecessarily mention that you are an AI.${context}

Current question:
${question}`;
}

function extractGeminiText(data) {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const candidateText = candidates
        .flatMap(candidate => Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [])
        .map(part => part?.text)
        .filter(text => typeof text === 'string' && text.trim())
        .join('')
        .trim();
    if (candidateText) return candidateText;

    // Also accept the Interactions API response shape if explicitly configured.
    if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
    return '';
}

async function askAI(question, history) {
    if (!AI_API_KEY) throw new Error('AI_NOT_CONFIGURED');

    const prompt = buildPrompt(question, history);
    let response;

    // Default Gemini endpoint uses generateContent. A custom URL can still be supplied.
    if (AI_API_URL.includes('/interactions')) {
        response = await axios.post(AI_API_URL, {
            model: AI_MODEL,
            store: false,
            input: prompt,
            generation_config: { max_output_tokens: Number(config.AI_MAX_OUTPUT_TOKENS || 700) }
        }, {
            timeout: AI_TIMEOUT_MS,
            headers: { 'x-goog-api-key': AI_API_KEY, 'Content-Type': 'application/json' },
            validateStatus: status => status >= 200 && status < 300
        });
    } else {
        response = await axios.post(`${AI_API_URL.replace(/\/$/, '')}/models/${AI_MODEL}:generateContent`, {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: Number(config.AI_MAX_OUTPUT_TOKENS || 700) }
        }, {
            timeout: AI_TIMEOUT_MS,
            headers: { 'x-goog-api-key': AI_API_KEY, 'Content-Type': 'application/json' },
            validateStatus: status => status >= 200 && status < 300
        });
    }

    const answer = extractGeminiText(response.data);
    if (!answer) throw new Error('AI_EMPTY_RESPONSE');
    return answer;
}

async function handleAIMention(conn, mek, m, context) {
    const { from, sender, isGroup, isCmd, body } = context;
    if (!isGroup || !from?.endsWith('@g.us') || isCmd || mek?.key?.fromMe) return;
    if (!isBotMentioned(conn, mek)) return;

    const question = cleanMention(body || getMessageText(mek), conn);
    if (!question) {
        await conn.sendMessage(from, { text: 'Yes? 🤖 Ask me something.' }, { quoted: mek });
        return;
    }

    const key = conversationKey(from, sender);
    const now = Date.now();
    if (now - (cooldowns.get(key) || 0) < AI_COOLDOWN_MS || pending.has(key)) return;

    cooldowns.set(key, now);
    pending.add(key);
    let composing = false;

    try {
        if (typeof conn.sendPresenceUpdate === 'function') {
            await conn.sendPresenceUpdate('composing', from);
            composing = true;
        }

        const answer = await askAI(question, getHistory(key));
        saveTurn(key, question, answer);
        await conn.sendMessage(from, { text: answer }, { quoted: mek });
    } catch (error) {
        const status = error?.response?.status;
        if (config.DEBUG === 'true') {
            console.error(`[AI Mention] Request failed (${status || 'network'})`);
        }
        await conn.sendMessage(from, {
            text: '❌ AI service temporarily unavailable. Please try again.'
        }, { quoted: mek });
    } finally {
        pending.delete(key);
        if (composing && typeof conn.sendPresenceUpdate === 'function') {
            try { await conn.sendPresenceUpdate('paused', from); } catch (_) {}
        }
    }
}

cmd({
    on: 'body',
    desc: 'AI replies when the bot is mentioned in a group',
    category: 'ai',
    dontAddCommandList: true,
    filename: __filename
}, handleAIMention);

console.log('🤖 VU ULTIMATE - AI mention handler loaded');
