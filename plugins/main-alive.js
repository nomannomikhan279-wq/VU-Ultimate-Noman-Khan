const { cmd, commands } = require('../redx');
const os = require("os");
const { runtime } = require('../lib/functions');
const config = require('../config');

cmd({
    pattern: "alive",
    alias: ["status", "live"],
    desc: "Check uptime and system status",
    category: "main",
    react: "👑",
    filename: __filename
},
async (conn, mek, m, { from, sender, reply }) => {
    try {
        const totalCmds = commands.length;
        const uptime = () => {
            let sec = process.uptime();
            let h = Math.floor(sec / 3600);
            let m = Math.floor((sec % 3600) / 60);
            let s = Math.floor(sec % 60);
            return `${h}h ${m}m ${s}s`;
        };

        const status = `
        *I AM ALIVE NOW 🤗♥️*
*┏────〘 INFO 〙───⊷*
*┃👑 MODE :❯ ${config.MODE || 'private'}*
*┃👑 USER :❯ ${config.OWNER_NAME || 'VU ULTIMATE'}*
*┃👑 PREFIX :❯ ❮ ${config.PREFIX || '.'} ❯*
*┃👑 VERSION :❯ 1.0.0*
*┃👑 TOTAL CMNDS :❯ ❮ ${totalCmds} ❯*
*┃👑 UPTIME :❯ ${uptime()}*
*┗──────────────⊷*
*👑 VU ULTIMATE WHATSAPP BOT 👑*`;

        await conn.sendMessage(from, { 
            text: status,
            contextInfo: {
                mentionedJid: [sender],
                forwardingScore: 999,
                isForwarded: true
            }
        }, { quoted: mek });

    } catch (e) {
        console.error("Error in alive command:", e);
        reply(`An error occurred: ${e.message}`);
    }
});

// 📱 VU ULTIMATE APP LINK
cmd({
    pattern: "applink",
    alias: ["app-link"],
    desc: "Get VU ULTIMATE app link",
    category: "main",
    react: "📱",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        await reply(
            "📱 *VU ULTIMATE APP*\n\n" +
            "🔗 https://rb.gy/vwxyp9"
        );
    } catch (e) {
        console.error("AppLink Error:", e);
        await reply("❌ App link send karne mein error aaya.");
    }
});
