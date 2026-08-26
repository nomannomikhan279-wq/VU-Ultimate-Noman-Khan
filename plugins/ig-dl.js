const axios = require("axios");
const { cmd } = require('../redx');
const { fakevCard } = require('../lib/fakevCard');

cmd({
    pattern: "igdl",
    alias: ["instagram", "insta", "ig"],
    react: "⬇️",
    desc: "Download Instagram videos/reels",
    category: "downloader",
    use: ".igdl <Instagram URL>",
    filename: __filename
}, async (conn, mek, m, { from, reply, args, q }) => {
    try {
        const url = q || m.quoted?.text;
        if (!url || !url.includes("instagram.com")) {
            return reply("❌ Please provide/reply to an Instagram link");
        }

        await conn.sendMessage(from, { react: { text: '⏳', key: m.key } });

        const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`;
        const response = await axios.get(apiUrl);

        if (!response.data?.status || !response.data.data?.length) {
            await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
            return reply("Failed to fetch media. Invalid link or private content.");
        }

        for (const item of response.data.data) {
            await conn.sendMessage(from, {
                [item.type === 'video' ? 'video' : 'image']: { url: item.url },
                caption: `‎*_ɪɴsᴛᴀɢʀᴀᴍ ᴅᴏᴡɴʟᴏᴀᴅᴇʀ_*

‎╔ஜ۩▒█ *ᴀʀꜱʟᴀɴ X ᴍᴅ* █▒۩ஜ╗
‎*|* 𝙿𝙾𝚆𝙴𝚁𝙴𝙳 𝙱𝚈 *Noman Khan* 
‎*╰━━━━━━━━━━━━━━━━━━⊷*
‎`
            }, { quoted: fakevCard });
        }

        await conn.sendMessage(from, { react: { text: '✅', key: m.key } });

    } catch (error) {
        console.error('IGDL Error:', error);
        await conn.sendMessage(from, { react: { text: '❌', key: m.key } });
        reply("❌ Download failed. Try again later.");
    }
});
