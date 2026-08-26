const { cmd } = require("../redx");
const moment = require("moment");
const { fakevCard } = require('../lib/fakevCard');

let botStartTime = Date.now();
const ALIVE_IMG = "https://images.weserv.nl/?url=raw.githubusercontent.com%2Fnomannomikhan279-wq%2FVU-Ultimate-Noman-Khan%2Fmain%2Fassets%2Fvu-ultimate-logo.svg&output=png";

cmd({
    pattern: "alive",
    desc: "Check if the bot is active.",
    category: "owner",
    react: "💡",
    filename: __filename
}, async (conn, mek, m, { reply, from }) => {
    try {
        const pushname = m.pushName || "User";
        const currentTime = moment().format("HH:mm:ss");
        const currentDate = moment().format("dddd, MMMM Do YYYY");

        const runtimeMilliseconds = Date.now() - botStartTime;
        const runtimeSeconds = Math.floor((runtimeMilliseconds / 1000) % 60);
        const runtimeMinutes = Math.floor((runtimeMilliseconds / (1000 * 60)) % 60);
        const runtimeHours = Math.floor(runtimeMilliseconds / (1000 * 60 * 60));

        const formattedInfo = `
╭┄┄┄┄[ *Noman Khan sᴛᴀᴛᴜs* ]┄┄┄┄
┊
┊     Hi 🫵🏽 ${pushname}
┊
┊🕒 *ᴛɪᴍᴇ*: ${currentTime}
┊📅 *ᴅᴀᴛᴇ*: ${currentDate}
┊⏳ *ᴜᴘᴛɪᴍᴇ*: ${runtimeHours} hours, ${runtimeMinutes} minutes, ${runtimeSeconds} seconds
╰───────────────

> 🤖 *Status*: *VU ULTIMATE is Alive and Ready!*

🎉 *Enjoy the Service!*
        `.trim();

        if (!ALIVE_IMG || !ALIVE_IMG.startsWith("http")) {
            throw new Error("Invalid ALIVE_IMG URL. Please set a valid URL.");
        }

        await conn.sendMessage(from, {
            image: { url: ALIVE_IMG },
            caption: formattedInfo,
            contextInfo: {
                mentionedJid: [m.sender],
                forwardingScore: 999,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: '120363411977621625@newsletter',
                    newsletterName: 'VU ULTIMATE',
                    serverMessageId: 143
                }
            }
        }, { quoted: fakevCard });

    } catch (error) {
        console.error("Error in alive command: ", error);
        return reply(`❌ An error occurred while processing the alive command.\n\n🛠 Error: ${error.message}`);
    }
});

// 📱 VU ULTIMATE APP LINK
cmd({
    pattern: "applink",
    alias: ["app", "app-link"],
    desc: "Get the VU ULTIMATE app link",
    category: "main",
    react: "📱",
    filename: __filename
}, async (conn, mek, m, { reply }) => {
    await reply("📱 *VU ULTIMATE APP*\n\n🔗 https://rb.gy/vwxyp9");
});
