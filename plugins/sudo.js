const { cmd } = require('../redx');
const config = require('../config');
const {
    PRIMARY_OWNER,
    normalize,
    isPrimaryOwner,
    addSudo,
    removeSudo,
    listSudo,
    loadSudoUsers
} = require('../lib/sudo');
const mongoose = require('mongoose');

cmd({
    pattern: 'sudo',
    alias: ['sudolist', 'setsudo'],
    desc: 'Manage trusted sudo users',
    category: 'owner',
    react: '👑',
    filename: __filename
}, async (conn, mek, m, { body, sender, reply }) => {
    if (!isPrimaryOwner(sender)) {
        return reply('🚫 Only the primary owner can manage the sudo list.');
    }

    const parts = String(body || '').trim().split(/\s+/);
    const action = (parts[1] || '').toLowerCase();
    const rest = parts.slice(2).join(' ');
    const mentioned = m.msg?.contextInfo?.mentionedJid || [];
    const fromMention = Array.isArray(mentioned) ? mentioned.find(Boolean) : mentioned;
    const match = rest.match(/(?:^|\s)@?(\d{7,15})(?=\s|$)/);
    const target = normalize(fromMention || (match ? match[1] : ''));

    try {
        if (!action || action === 'list') {
            const users = await listSudo();
            return reply(users.length
                ? `👑 SUDO USERS\n\n${users.map((n, i) => `${i + 1}. +${n}`).join('\n')}`
                : `👑 SUDO USERS\n\nNo sudo users added yet.\n\nExample:\n${config.PREFIX || '.'}sudo add @923001234567`);
        }

        if (!['add', 'del', 'remove'].includes(action)) {
            return reply(`❌ Invalid action.\n\n${config.PREFIX || '.'}sudo add @number\n${config.PREFIX || '.'}sudo del @number\n${config.PREFIX || '.'}sudo list`);
        }

        if (!target) {
            return reply(`❌ Please provide/mention a WhatsApp number.\n\nExample:\n${config.PREFIX || '.'}sudo add @923001234567`);
        }

        if (target === PRIMARY_OWNER) {
            return reply('ℹ️ This number is already the primary owner.');
        }

        if (action === 'add') {
            await addSudo(target, PRIMARY_OWNER);
            return reply(`✅ Sudo user added successfully.\n\n👑 Number: +${target}\n🔐 This number can now use owner commands.`);
        }

        const removed = await removeSudo(target);
        if (!removed) return reply('❌ This number is not in the sudo list.');
        return reply(`✅ Sudo user removed successfully.\n\nNumber: +${target}`);
    } catch (error) {
        console.error('[SUDO] Command error:', error);
        if (error.message === 'INVALID_NUMBER') return reply('❌ Invalid WhatsApp number.');
        if (error.message === 'PRIMARY_OWNER') return reply('ℹ️ This number is already the primary owner.');
        if (error?.code === 11000) return reply('ℹ️ This number is already in the sudo list.');
        if (mongoose.connection.readyState !== 1) return reply('❌ MongoDB is not connected. Please try again after the database connects.');
        return reply('❌ Failed to update the sudo list.');
    }
});

setImmediate(async () => {
    try {
        let attempts = 0;
        while (mongoose.connection.readyState !== 1 && attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 500));
            attempts++;
        }
        await loadSudoUsers();
    } catch (error) {
        console.error('[SUDO] Startup load error:', error.message);
    }
});
