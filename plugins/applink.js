const { cmd } = require('../redx');

const APP_LINK = 'https://rb.gy/vwxyp9';

cmd({
    pattern: 'applink',
    alias: ['app-link', 'app'],
    desc: 'Get the VU ULTIMATE app link',
    category: 'main',
    react: '📱',
    filename: __filename
}, async (conn, mek, m, { from, reply }) => {
    try {
        await reply(`📱 *VU ULTIMATE APP*\n\n🔗 ${APP_LINK}`);
    } catch (error) {
        console.error('AppLink Error:', error);
        reply('*❌ App link send karne mein error aaya.*');
    }
});
