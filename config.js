// ═══════════════════════════════════════════════════════════════════════════
//                    VU ULTIMATE - CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const dotenv = require('dotenv');

if (fs.existsSync('.env')) dotenv.config({ path: '.env' });

const PRIMARY_OWNER_JID = '923008872807@s.whatsapp.net';
const PRIMARY_OWNER_NUMBER = PRIMARY_OWNER_JID.split('@')[0];

module.exports = {
    SESSION_ID: process.env.SESSION_ID || 'MINI BOT',
    MONGODB_URI: process.env.MONGODB_URI || '',
    CHANNEL_JID: process.env.CHANNEL_JID || '120363411977621625@newsletter',
    CHANNEL_IDS: ['120363411977621625@newsletter'],
    REACT_EMOJIS: ['🤍','🥰','🪸','🖤','💜','💙','💚','💛','🧡','❤','💝','⚜️','〽️','🍫','🍧','🍨','🍷','🥃','😘','🤡','🤤','🤠','🔥','👑','💯','😍','💖','✨','🎉'],
    PREFIX: process.env.PREFIX || '.',
    MODE: process.env.MODE || process.env.WORK_TYPE || 'public',
    BOT_NAME: process.env.BOT_NAME || '🔥 VU ULTIMATE 🔥',
    OWNER_NAME: process.env.OWNER_NAME || 'Noman Khan',
    PRIMARY_OWNER_JID,
    PRIMARY_OWNER_NUMBER,
    OWNER_NUMBER: [...new Set([
        PRIMARY_OWNER_NUMBER,
        ...(process.env.OWNER_NUMBER || '').split(',').map(n => n.trim().replace(/[^0-9]/g, '')).filter(Boolean)
    ])],
    BOT_FOOTER: process.env.BOT_FOOTER || '© ᴘᴏᴡᴇʀᴇᴅ ʙʏ Noman Khan',
    AUTO_STATUS_SEEN: process.env.AUTO_STATUS_SEEN || 'true',
    AUTO_STATUS_REACT: process.env.AUTO_STATUS_REACT || 'true',
    AUTO_STATUS_EMOJIS: ['❤️','🔥','👑','💯','😍','💖','✨'],
    AUTO_STATUS_REPLY: process.env.AUTO_STATUS_REPLY || 'false',
    AUTO_STATUS_MSG: process.env.AUTO_STATUS_MSG || '❤️ Nice status!',
    READ_MESSAGE: process.env.READ_MESSAGE || 'false',
    AUTO_TYPING: process.env.AUTO_TYPING || 'false',
    AUTO_RECORDING: process.env.AUTO_RECORDING || 'false',
    BOT_ONLINE: process.env.BOT_ONLINE || 'true',
    KEEP_ONLINE: process.env.KEEP_ONLINE || 'true',
    ANTIDELETE: process.env.ANTIDELETE || 'false',
    ANTIDELETE_NOTIFY: process.env.ANTIDELETE_NOTIFY || 'false',
    ANTI_CALL: process.env.ANTI_CALL || 'false',
    REJECT_MSG: process.env.REJECT_MSG || '📵 Call rejected by bot',
    GROUP_WELCOME: process.env.GROUP_WELCOME || 'false',
    GROUP_GOODBYE: process.env.GROUP_GOODBYE || 'false',
    GROUP_PROMOTE: process.env.GROUP_PROMOTE || 'false',
    GROUP_DEMOTE: process.env.GROUP_DEMOTE || 'false',
    WELCOME_MESSAGE: process.env.WELCOME_MESSAGE || '👋 Welcome to the group!',
    GOODBYE_MESSAGE: process.env.GOODBYE_MESSAGE || '👋 Goodbye!',
    AUTO_FOLLOW_CHANNEL: process.env.AUTO_FOLLOW_CHANNEL || 'true',
    AUTO_CHANNEL_REACT: process.env.AUTO_CHANNEL_REACT || 'true',
    AUTO_CHANNEL_REACT_EMOJIS: ['❤️','🔥','👑','💯','😍','💖','✨'],
    CUSTOM_REACT: process.env.CUSTOM_REACT || 'false',
    CUSTOM_REACT_EMOJIS: process.env.CUSTOM_REACT_EMOJIS || '💕,👑,♥️,🇵🇰,👑,😘,❤️,🦁,☺️,💫,👍🏻,🙂',
    SEND_UNKNOWN_COMMAND: process.env.SEND_UNKNOWN_COMMAND || 'true',
    IMAGE_PATH: process.env.IMAGE_PATH || 'https://i.ibb.co/tPBqm8Pj/file-00000000faa8820892863f11bf1c1adc.png',
    CHANNEL_LINK: process.env.CHANNEL_LINK || 'https://whatsapp.com/channel/0029Vb8Eyyb1Hsq2wfPNHN3R',
    GROUP_LINK: process.env.GROUP_LINK || '',
    OWNER_LINK: process.env.OWNER_LINK || '',
    REPO: process.env.REPO || '',
    DEBUG: process.env.DEBUG || 'false',
    LOGGING_ENABLED: process.env.LOGGING_ENABLED || 'true',
    BAILEYS: '@whiskeysockets/baileys',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
    TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || ''
};
