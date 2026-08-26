const mongoose = require('mongoose');

const warningSchema = new mongoose.Schema({
    groupJid: { type: String, required: true, index: true },
    userJid: { type: String, required: true, index: true },
    count: { type: Number, default: 0, min: 0, max: 3 },
    updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

warningSchema.index({ groupJid: 1, userJid: 1 }, { unique: true });

const Warning = mongoose.models.VUWarning || mongoose.model('VUWarning', warningSchema);

function normalizeJid(jid) {
    return String(jid || '').replace(/:\d+(?=@)/, '').trim();
}

async function addWarning(groupJid, userJid) {
    const group = normalizeJid(groupJid);
    const user = normalizeJid(userJid);
    if (!group || !user) throw new Error('INVALID_WARNING_TARGET');

    const record = await Warning.findOneAndUpdate(
        { groupJid: group, userJid: user },
        {
            $inc: { count: 1 },
            $set: { updatedAt: new Date() }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (record.count > 3) {
        record.count = 3;
        await record.save();
    }

    return record.count;
}

async function getWarnings(groupJid, userJid) {
    const record = await Warning.findOne({
        groupJid: normalizeJid(groupJid),
        userJid: normalizeJid(userJid)
    }).lean();
    return record?.count || 0;
}

async function resetWarnings(groupJid, userJid) {
    return Warning.deleteOne({
        groupJid: normalizeJid(groupJid),
        userJid: normalizeJid(userJid)
    });
}

module.exports = { Warning, addWarning, getWarnings, resetWarnings };
