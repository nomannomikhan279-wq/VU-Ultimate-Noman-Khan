const mongoose = require('mongoose');
const config = require('../config');

const PRIMARY_OWNER = '923008872807';
const sudoNumbers = new Set();

const sudoSchema = new mongoose.Schema({
    number: { type: String, required: true, unique: true, index: true },
    addedBy: { type: String, default: PRIMARY_OWNER },
    createdAt: { type: Date, default: Date.now }
});

const SudoUser = mongoose.models.SudoUser || mongoose.model('SudoUser', sudoSchema);

function normalize(number) {
    let n = String(number || '').replace(/[^0-9]/g, '');
    if (n.startsWith('00')) n = n.slice(2);
    if (n.startsWith('0') && n.length === 11) n = '92' + n.slice(1);
    return n;
}

function syncConfigOwners() {
    if (!Array.isArray(config.OWNER_NUMBER)) config.OWNER_NUMBER = [];
    for (const number of sudoNumbers) {
        if (!config.OWNER_NUMBER.includes(number)) config.OWNER_NUMBER.push(number);
    }
}

function isPrimaryOwner(number) {
    return normalize(number) === PRIMARY_OWNER;
}

function isSudo(number) {
    return sudoNumbers.has(normalize(number));
}

async function loadSudoUsers() {
    try {
        if (mongoose.connection.readyState !== 1) return false;
        const users = await SudoUser.find({}).select({ number: 1, _id: 0 }).lean();
        sudoNumbers.clear();
        for (const user of users) {
            const number = normalize(user.number);
            if (number && number !== PRIMARY_OWNER) sudoNumbers.add(number);
        }
        syncConfigOwners();
        console.log(`[SUDO] Loaded ${sudoNumbers.size} sudo user(s).`);
        return true;
    } catch (error) {
        console.error('[SUDO] Load error:', error.message);
        return false;
    }
}

async function addSudo(number, addedBy = PRIMARY_OWNER) {
    const clean = normalize(number);
    if (!clean) throw new Error('INVALID_NUMBER');
    if (clean === PRIMARY_OWNER) throw new Error('PRIMARY_OWNER');

    await SudoUser.findOneAndUpdate(
        { number: clean },
        { number: clean, addedBy: normalize(addedBy) || PRIMARY_OWNER },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    sudoNumbers.add(clean);
    syncConfigOwners();
    return clean;
}

async function removeSudo(number) {
    const clean = normalize(number);
    if (!clean) throw new Error('INVALID_NUMBER');
    if (clean === PRIMARY_OWNER) throw new Error('PRIMARY_OWNER');

    const result = await SudoUser.deleteOne({ number: clean });
    sudoNumbers.delete(clean);

    if (Array.isArray(config.OWNER_NUMBER)) {
        config.OWNER_NUMBER = config.OWNER_NUMBER.filter(n => normalize(n) !== clean);
    }

    return result.deletedCount > 0;
}

async function listSudo() {
    const users = await SudoUser.find({}).sort({ createdAt: 1 }).select({ number: 1, _id: 0 }).lean();
    return users.map(user => normalize(user.number)).filter(Boolean);
}

module.exports = {
    PRIMARY_OWNER,
    SudoUser,
    normalize,
    isPrimaryOwner,
    isSudo,
    addSudo,
    removeSudo,
    listSudo,
    loadSudoUsers,
    sudoNumbers
};
