const mongoose = require('mongoose');

const groupScheduleSchema = new mongoose.Schema({
    groupJid: { type: String, required: true, unique: true, index: true },
    botNumber: { type: String, required: true, index: true },
    closeTime: { type: String, default: '' },
    openTime: { type: String, default: '' },
    timezone: { type: String, default: 'Asia/Karachi' },
    enabled: { type: Boolean, default: true },
    lastCloseKey: { type: String, default: '' },
    lastOpenKey: { type: String, default: '' }
}, { timestamps: true });

const GroupSchedule = mongoose.models.VUGroupSchedule || mongoose.model('VUGroupSchedule', groupScheduleSchema);

function normalizeTime(value) {
    const m = String(value || '').trim().match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

async function getSchedule(groupJid) {
    return GroupSchedule.findOne({ groupJid }).lean();
}

async function setSchedule(groupJid, botNumber, changes) {
    return GroupSchedule.findOneAndUpdate(
        { groupJid },
        { $set: { botNumber, ...changes } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
}

async function disableSchedule(groupJid) {
    return GroupSchedule.findOneAndUpdate(
        { groupJid },
        { $set: { enabled: false, closeTime: '', openTime: '' } },
        { new: true }
    ).lean();
}

module.exports = { GroupSchedule, normalizeTime, getSchedule, setSchedule, disableSchedule };
