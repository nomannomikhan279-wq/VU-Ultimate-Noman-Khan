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

// ========== SETTINGS.JS SE FETCH ==========
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

// ========== ANTI-DELETE FIXED IMPORT ==========
const { handleAntidelete } = require('./lib/antidelete');

// ========== 🆕 SYSTEM FUNCTIONS (Channel Follow + React) ==========
const { 
    redxminibot, 
    autoReactChannel, 
    autoHandleStatus,
    reactToChannelPost,
    CHANNEL_IDS,
    REACT_EMOJIS 
} = require('./lib/system');

const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const pino = require('pino');
const crypto = require('crypto');
const FileType = require('file-type');
const axios = require('axios');
const moment = require('moment-timezone');
const chalk = require('chalk');

// ========== IMPORT VU ULTIMATE FEATURES ==========
const GroupEvents = require('./lib/groupevents');
const { PresenceControl, BotActivityFilter } = require('./data/presence');
const registerAntiCall = require('./lib/anticall');
const { getPrefix } = require('./lib/prefix');
const { handleReaction } = require('./lib/reaction');
const { fakevCard } = require('./lib/fakevCard');
const AntiDelete = require('./lib/antidelete');

// ========== SETTINGS.JS SE VALUES ==========
const prefix = config.PREFIX || '.';
const mode = config.MODE || config.WORK_TYPE || 'public';
const BOT_NAME = config.BOT_NAME || 'VU ULTIMATE';
const OWNER_NAME = config.OWNER_NAME || 'Noman Khan';
const OWNER_NUMBER = config.OWNER_NUMBER || [];

// ========== NUMBER HELPERS ==========
function cleanNumber(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

// Normalize Pakistani local format (0300...) and international format (92300...)
// so owner checks work regardless of how WhatsApp exposes the sender JID.
function normalizeOwnerNumber(number) {
    let n = cleanNumber(number);
    if (n.startsWith('00')) n = n.slice(2);
    if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
    return n;
}

function isOwnerNumber(number) {
    const normalized = normalizeOwnerNumber(number);
    return OWNER_NUMBER.some(owner => normalizeOwnerNumber(owner) === normalized);
}

function getBotNumber(socket) {
    try {
        const id = socket?.user?.id;
        if (!id) return '';
        return cleanNumber(id.includes(':') ? id.split(':')[0] : id.split('@')[0]);
    } catch { return ''; }
}

function getBotJid(socket) {
    const num = getBotNumber(socket);
    return num ? `${num}@s.whatsapp.net` : '';
}

function isNumberAlreadyConnected(number) {
    return activeSockets.has(number.replace(/[^0-9]/g, ''));
}

function getConnectionStatus(number) {
    const n = number.replace(/[^0-9]/g, '');
    const isConnected = activeSockets.has(n);
    const connectionTime = socketCreationTime.get(n);
    return {
        isConnected,
        connectionTime: connectionTime ? new Date(connectionTime).toLocaleString() : null,
        uptime: connectionTime ? Math.floor((Date.now() - connectionTime) / 1000) : 0
    };
}

function redxLog(message, type = 'info') {
    const icons = { info: '📝', success: '✅', error: '❌', warning: '⚠️', debug: '🐛' };
    console.log(`${icons[type] || '📝'} [VU ULTIMATE-MINI] ${new Date().toISOString()}: ${message}`);
}

// ========== CACHE / STORE / HELPERS ==========
class SmartCache {
    constructor(maxSize = 300, cleanupInterval = 180000) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
        this.statsInterval = setInterval(() => this.logStats(), 1800000);
        this.cleanupInterval = setInterval(() => this.cleanupOld(), cleanupInterval);
    }
    set(key, value, ttl = 3600000) {
        if (this.cache.size >= this.maxSize) this.evictLRU();
        this.cache.set(key, { value, timestamp: Date.now(), ttl, lastAccess: Date.now() });
    }
    get(key) {
        const item = this.cache.get(key);
        if (!item) { this.misses++; return null; }
        if (Date.now() - item.timestamp > item.ttl) { this.cache.delete(key); this.misses++; return null; }
        item.lastAccess = Date.now(); this.hits++; return item.value;
    }
    delete(key) { this.cache.delete(key); }
    clear() { this.cache.clear(); this.hits = 0; this.misses = 0; }
    evictLRU() {
        if (!this.cache.size) return;
        let lruKey = null, lruTime = Date.now();
        for (const [key, value] of this.cache.entries()) if (value.lastAccess < lruTime) { lruTime = value.lastAccess; lruKey = key; }
        if (lruKey) this.cache.delete(lruKey);
    }
    cleanupOld() {
        const now = Date.now(); let deleted = 0;
        for (const [key, value] of this.cache.entries()) if (now - value.timestamp > value.ttl) { this.cache.delete(key); deleted++; }
        if (deleted > 0 && config.DEBUG === 'true') console.log(chalk.gray(`[ 🧹 ] Cache cleaned: ${deleted} expired`));
    }
    logStats() {
        const total = this.hits + this.misses; if (!total) return;
        console.log(chalk.gray(`[ 📊 ] Cache: ${this.cache.size}/${this.maxSize} | Hit: ${Math.round((this.hits / total) * 100)}%`));
        this.hits = 0; this.misses = 0;
    }
    destroy() { clearInterval(this.statsInterval); clearInterval(this.cleanupInterval); this.clear(); }
}

const messageCache = new SmartCache(300, 180000);
const groupMetaCache = new SmartCache(100, 300000);
const userCache = new SmartCache(200, 300000);
const activeSockets = new Map();
const socketCreationTime = new Map();
const processedMessages = new Set();
const RATE_LIMIT = 5;
const RATE_WINDOW = 1000;
const userMessageCounts = new Map();

function checkRateLimit(senderNumber) {
    const now = Date.now();
    const userData = userMessageCounts.get(senderNumber) || { count: 0, timestamp: now };
    if (now - userData.timestamp > RATE_WINDOW) { userData.count = 1; userData.timestamp = now; }
    else userData.count++;
    userMessageCounts.set(senderNumber, userData);
    return userData.count <= RATE_LIMIT;
}

function createStore() {
    const store = {
        messages: {},
        bind(ev) {
            ev.on('messages.upsert', ({ messages }) => {
                for (const msg of messages) {
                    const jid = msg.key && msg.key.remoteJid;
                    if (!jid) continue;
                    if (!store.messages[jid]) store.messages[jid] = [];
                    store.messages[jid].push(msg);
                    if (store.messages[jid].length > 200) store.messages[jid].shift();
                }
            });
        },
        async loadMessage(jid, id) {
            if (!store.messages[jid]) return null;
            return store.messages[jid].find(m => m.key && m.key.id === id) || null;
        }
    };
    return store;
}

const createSerial = (size) => crypto.randomBytes(size).toString('hex').slice(0, size);

function getGroupAdmins(participants) {
    let admins = [];
    for (let i of participants) if (i.admin === 'admin' || i.admin === 'superadmin') admins.push(i.id);
    return admins;
}

// NOTE: The rest of this file is intentionally kept functionally equivalent.
// Existing functions/handlers continue below this section.

function findCommand(cmdName) {
    try {
        const events = require('./redx');
        const name = String(cmdName || '').trim().toLowerCase();
        return events.commands.find(cmd => String(cmd.pattern || '').toLowerCase() === name || (cmd.alias && cmd.alias.map(a => String(a).toLowerCase()).includes(name)));
    } catch { return null; }
}
