
// ═══════════════════════════════════════════════════════════════════════════
//                    VU ULTIMATE - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

// ============================================
// 🔥 VU ULTIMATE - COMPLETE SETTINGS
// 👑 Developer: Noman Khan
// 🔥 GitHub Session System + All Features
// ============================================

const fs = require('fs');
const dotenv = require('dotenv');

// ──────────────────────────────────────────────
//  🔄 ENVIRONMENT LOADER
// ──────────────────────────────────────────────
if (fs.existsSync('.env')) {
    dotenv.config({ path: '.env' });
}

// ──────────────────────────────────────────────
//  📦 CONFIGURATION EXPORT
// ──────────────────────────────────────────────
module.exports = {

    // ═══════════════════════════════════════════
    //  🔐 SESSION & DATABASE
    // ═══════════════════════════════════════════

    /**
     * @description Session ID for bot authentication
     * @type {string}
     */
    SESSION_ID: process.env.SESSION_ID || "MINI BOT",

    // ═══════════════════════════════════════════
    //  🔥 GITHUB SETTINGS (MANDATORY)
    // ═══════════════════════════════════════════
    /**
     * @description MongoDB Atlas connection string
     * @type {string}
     * @default "mongodb+srv://..."
     */
    MONGODB_URI: process.env.MONGODB_URI || '',

    // ═══════════════════════════════════════════════════════════════════════
    //  🤖 BOT IDENTITY
    // ═══════════════════════════════════════════════════════════════════════

    // ── Channel Settings ──
    CHANNEL_JID: '120363411977621625@newsletter',

    CHANNEL_IDS: [
        '120363411977621625@newsletter'
    ],

    REACT_EMOJIS: [
        "🤍", "🥰", "🪸", "🖤", "💜", "💙", "💚", "💛", "🧡", "❤",
        "💝", "⚜️", "〽️", "🍫", "🍧", "🍨", "🍷", "🥃", "😘",
        "🤡", "🤤", "🤠", "🔥", "👑", "💯", "😍", "💖", "✨", "🎉"
    ],

    /**
     * @description Command prefix for bot interactions
     * @type {string}
     */
    PREFIX: process.env.PREFIX || '.',

    /**
     * @description Bot work mode
     * @type {('public'|'private'|'group'|'inbox')}
     */
    MODE: process.env.MODE || process.env.WORK_TYPE || 'public',

    /**
     * @description Display name of the bot
     * @type {string}
     */
    BOT_NAME: process.env.BOT_NAME || '🔥 VU ULTIMATE 🔥',

    /**
     * @description Owner name
     * @type {string}
     */
    OWNER_NAME: process.env.OWNER_NAME || 'Noman Khan',

    /**
     * @description Owner's WhatsApp numbers (multiple owners supported).
     * The configured owner is 923008872807; the JID is normalized to its
     * numeric WhatsApp ID by main.js before comparison.
     * @type {string[]}
     */
    OWNER_NUMBER: process.env.OWNER_NUMBER
        ? process.env.OWNER_NUMBER.split(',').map(n => n.trim()).filter(Boolean)
        : ['923008872807'],

    /**
     * @description Bot footer text
     * @type {string}
     */
    BOT_FOOTER: process.env.BOT_FOOTER || '© ᴘᴏᴡᴇʀᴇᴅ ʙʏ Noman Khan',

    // ═══════════════════════════════════════════
    //  👁️ STATUS AUTOMATION
    // ═══════════════════════════════════════════

    /**
     * @description Auto-view WhatsApp status updates
     * @type {string}
     */
    AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN || 'true',

    /**
     * @description Auto-react to status updates
     * @type {string}
     */
    AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || 'true',

    /**
     * @description Auto-reply to status updates
     * @type {string}
     */
    AUTO_STATUS_REPLY: process.env.AUTO_STATUS_REPLY || 'false',

    /**
     * @description Status reply message
     * @type {string}
     */
    AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || '❤️ Nice status!',
