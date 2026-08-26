const mongoose = require('mongoose');

const customCommandSchema = new mongoose.Schema({
    number: {
        type: String,
        required: true,
        index: true
    },
    command: {
        type: String,
        required: true,
        trim: true
    },
    response: {
        type: String,
        required: true
    }
}, {
    timestamps: true
});

customCommandSchema.index({ number: 1, command: 1 }, { unique: true });

const CustomCommand = mongoose.models.CustomCommand || mongoose.model('CustomCommand', customCommandSchema);

const COMMAND_NAME_REGEX = /^[a-z0-9][a-z0-9_-]{0,31}$/;

function normalizeCommandName(command) {
    return String(command || '').trim().toLowerCase();
}

function validateCommandName(command) {
    const normalized = normalizeCommandName(command);

    if (!normalized) {
        return { valid: false, error: '❌ Command name cannot be empty.' };
    }

    if (!COMMAND_NAME_REGEX.test(normalized)) {
        return {
            valid: false,
            error: '❌ Invalid command name. Use only letters, numbers, `_` or `-` (max 32 characters).'
        };
    }

    return { valid: true, command: normalized };
}

function cleanBotNumber(number) {
    return String(number || '').replace(/[^0-9]/g, '');
}

async function addCustomCommand(number, command, response) {
    const cleanNumber = cleanBotNumber(number);
    const result = validateCommandName(command);

    if (!result.valid) {
        const error = new Error(result.error);
        error.code = 'INVALID_COMMAND';
        throw error;
    }

    const text = String(response ?? '');
    if (!text.trim()) {
        const error = new Error('❌ Command response cannot be empty.');
        error.code = 'EMPTY_RESPONSE';
        throw error;
    }

    try {
        return await CustomCommand.create({
            number: cleanNumber,
            command: result.command,
            response: text
        });
    } catch (error) {
        if (error?.code === 11000) {
            const duplicate = new Error('❌ This custom command already exists.');
            duplicate.code = 'DUPLICATE_COMMAND';
            throw duplicate;
        }
        throw error;
    }
}

async function getCustomCommand(number, command) {
    const cleanNumber = cleanBotNumber(number);
    const normalized = normalizeCommandName(command);
    if (!cleanNumber || !normalized) return null;
    return CustomCommand.findOne({ number: cleanNumber, command: normalized }).lean();
}

async function updateCustomCommand(number, command, response) {
    const cleanNumber = cleanBotNumber(number);
    const result = validateCommandName(command);

    if (!result.valid) {
        const error = new Error(result.error);
        error.code = 'INVALID_COMMAND';
        throw error;
    }

    const text = String(response ?? '');
    if (!text.trim()) {
        const error = new Error('❌ Command response cannot be empty.');
        error.code = 'EMPTY_RESPONSE';
        throw error;
    }

    const updated = await CustomCommand.findOneAndUpdate(
        { number: cleanNumber, command: result.command },
        { response: text },
        { new: true, runValidators: true }
    ).lean();

    if (!updated) {
        const error = new Error('❌ Custom command does not exist.');
        error.code = 'COMMAND_NOT_FOUND';
        throw error;
    }

    return updated;
}

async function deleteCustomCommand(number, command) {
    const cleanNumber = cleanBotNumber(number);
    const normalized = normalizeCommandName(command);

    const deleted = await CustomCommand.findOneAndDelete({
        number: cleanNumber,
        command: normalized
    }).lean();

    if (!deleted) {
        const error = new Error('❌ Custom command does not exist.');
        error.code = 'COMMAND_NOT_FOUND';
        throw error;
    }

    return deleted;
}

async function listCustomCommands(number) {
    const cleanNumber = cleanBotNumber(number);
    return CustomCommand.find({ number: cleanNumber })
        .sort({ command: 1 })
        .select({ _id: 0, command: 1, response: 1 })
        .lean();
}

async function countCommandUsageAcrossBots(command) {
    return CustomCommand.countDocuments({ command: normalizeCommandName(command) });
}

async function getAllCustomCommandNames() {
    return CustomCommand.distinct('command');
}

async function waitForDatabase(timeoutMs = 15000) {
    if (mongoose.connection.readyState === 1) return true;

    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            mongoose.connection.off('connected', onConnected);
            mongoose.connection.off('error', onError);
            resolve(value);
        };

        const onConnected = () => finish(true);
        const onError = () => finish(false);
        const timer = setTimeout(() => finish(false), timeoutMs);

        mongoose.connection.once('connected', onConnected);
        mongoose.connection.once('error', onError);
    });
}

module.exports = {
    CustomCommand,
    normalizeCommandName,
    validateCommandName,
    addCustomCommand,
    getCustomCommand,
    updateCustomCommand,
    deleteCustomCommand,
    listCustomCommands,
    countCommandUsageAcrossBots,
    getAllCustomCommandNames,
    waitForDatabase
};
