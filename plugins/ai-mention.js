// ============================================
// 🤖 AI MENTION REPLY - VU ULTIMATE
// Replies only when the bot is actually mentioned in a group.
// Uses Gemini API via the existing environment/config system.
// ============================================

const axios = require('axios');
const { cmd } = require('../redx');
const config = require('../config');

const AI_API_KEY = config.AI_API_KEY;
const AI_MODEL = config.AI_MODEL;
const AI_API_URL = config.AI_API_URL;
const AI_COOLDOWN_MS = Math.min(60000, Math.max(1000, config.AI_COOLDOWN_MS || 5000));
const AI_CONTEXT_MESSAGES = Math.min(12, Math.max(0, config.AI_CONTEXT_MESSAGES || 6));
const AI_MAX_OUTPUT_TOKENS = Math.min(2048, Math.max(256, config.AI_MAX_OUTPUT_TOKENS || 700));
const AI_TIMEOUT_MS = Math.min(60000, Math.max(5000, config.AI_TIMEOUT_MS || 30000));

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
    const userId = conn?.user?.id || '';
    const normalized = normalizeJid(userId);
    if (normalized) ids.add(normalized);
    const number = jidNumber(userId);
    if (number) ids.add(`${number}@s.whatsapp.net`);
    return ids;
}

function isBotMentioned(conn, mek) {
    if (!mek?.key?.remoteJid?.endsWith('@g.us')) return false;

    const botJids = getBotJids(conn);
    const message = mek.message || {};
    const types = [
        'extendedTextMessage',
        'imageMessage',
        'videoMessage',
        'documentMessage',
        'buttonsResponseMessage',
        'listResponseMessage',
        'templateButtonReplyMessage',
        'interactiveResponseMessage'
    ];

    for (const type of types) {
        const contextInfo = message[type]?.contextInfo;
        const mentioned = contextInfo?.mentionedJid || [];
        if (mentioned.some(jid => botJids.has(normalizeJid(jid)) || jidNumber(jid) === jidNumber(conn?.user?.id))) {
            return true;
        }
    }

    return false;
}

function getMessageText(mek) {
    const message = mek?.message || {};
    return (
        message.conversation ||
        message.extendedTextMessage?.text ||
        message.imageMessage?.caption ||
        message.videoMessage?.caption ||
        message.documentMessage?.caption ||
        message.buttonsResponseMessage?.selectedButtonId ||
        message.listResponseMessage?.singleSelectReply?.selectedRowId ||
        message.templateButtonReplyMessage?.selectedId ||
        ''
    );
}

function cleanMention(text, conn) {
    let result = String(text || '');
    const botNumber = jidNumber(conn?.user?.id);

    // WhatsApp renders a user mention as @number. Remove only the bot's mention.
    if (botNumber) {
        const mentionRegex = new RegExp(`@${botNumber}\\b`, 'gi');
        result = result.replace(mentionRegex, ' ');
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
        ? `\nShort conversation context (use only when relevant):\n${history.map(item => `${item.role}: ${item.text}`).join('\n')}`
        : '';

    return [
        'You are VU ULTIMATE, a helpful WhatsApp group assistant.',
        'Answer the user directly and concisely by default.',
        'Match the user language: English, Urdu, Roman Urdu, or Hinglish.',
        'Support programming, general knowledge, explanations, translations, and calculations.',
        'Use useful formatting when it improves readability. Do not unnecessarily say you are an AI.',
        context,
        `\nCurrent user question:\n${question}`
    ].join('\n');
}

function extractText(data) {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();

    const steps = Array.isArray(data?.steps) ? data.steps : [];
    for (let i = steps.length - 1; i >= 0; i--) {
        const content = Array.isArray(steps[i]?.content) ? steps[i].content : [];
        const text = content
            .filter(part => part?.type === 'text' && typeof part.text === 'string')
            .map(part => part.text)
            .join('')
            .trim();
        if (text) return text;
    }

    const outputs = Array.isArray(data?.outputs) ? data.outputs : [];
    return outputs
        .filter(item => typeof item?.text === 'string')
        .map(item => item.text)
        .join('')
        .trim();
}

function classifyApiError(error) {
    const status = error?.response?.status;
    if (status === 401 || status === 403) return 'authentication';
    if (status === 429) return 'rate_limit';
    if (status >= 400 && status < 500) return 'request';
    return 'network';
}

async function askGemini(question, history) {
    if (!AI_API_KEY) throw new Error('AI_NOT_CONFIGURED');

    const response = await axios.post(
        AI_API_URL,
        {
            model: AI_MODEL,
            store: false,
            input: buildPrompt(question, history),
            generation_config: {
                max_output_tokens: AI_MAX_OUTPUT_TOKENS
            }
        },
        {
            timeout: AI_TIMEOUT_MS,
            headers: {
                'x-goog-api-key': AI_API_KEY,
                'Content-Type': 'application/json'
            },
            validateStatus: status => status >= 200 && status < 300
        }
    );

    const answer = extractText(response.data);
    if (!answer) throw new Error('AI_EMPTY_RESPONSE');
    return answer;
}

async function handleAIMention(conn, mek, context) {
    const { from, sender, isGroup, isCmd, body, isOwner } = context;
    if (!isGroup || isCmd || !from?.endsWith('@g.us')) return;
    if (!isBotMentioned(conn, mek)) return;
    if (mek?.key?.fromMe || isOwner) return;

    const question = cleanMention(body || getMessageText(mek), conn);
    if (!question) {
        return conn.sendMessage(from, { text: 'Yes? 🤖 Ask me something.' }, { quoted: mek });
    }

    const key = conversationKey(from, sender);
    const now = Date.now();
    const last = cooldowns.get(key) || 0;
    if (now - last < AI_COOLDOWN_MS) return;
    if (pending.has(key)) return;

    cooldowns.set(key, now);
    pending.add(key);

    let typingStarted = false;
    try {
        if (typeof conn.sendPresenceUpdate === 'function') {
            await conn.sendPresenceUpdate('composing', from);
            typingStarted = true;
        }

        const history = getHistory(key);
        const answer = await askGemini(question, history);
        saveTurn(key, question, answer);

        await conn.sendMessage(from, { text: answer }, { quoted: mek });
    } catch (error) {
        const kind = classifyApiError(error);
        if (config.DEBUG === 'true' && kind !== 'authentication') {
            console.error('[AI Mention] Request failed:', kind);
        }
        await conn.sendMessage(from, {
            text: '❌ AI service temporarily unavailable. Please try again.'
        }, { quoted: mek });
    } finally {
        pending.delete(key);
        if (typingStarted && typeof conn.sendPresenceUpdate === 'function') {
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
