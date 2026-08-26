const { cmd, commands } = require('../redx');
const config = require('../config');
const {
    addCustomCommand,
    getCustomCommand,
    updateCustomCommand,
    deleteCustomCommand,
    listCustomCommands,
    countCommandUsageAcrossBots,
    getAllCustomCommandNames,
    validateCommandName,
    normalizeCommandName,
    waitForDatabase
} = require('../lib/custom-commands');

const CUSTOM_MARKER = '__vuUltimateCustomCommand';

function getCommandAliases(command) {
    if (!command?.alias) return [];
    return Array.isArray(command.alias) ? command.alias : [command.alias];
}

function isBuiltinCommand(commandName) {
    const name = normalizeCommandName(commandName);
    return commands.some((entry) => {
        if (entry?.[CUSTOM_MARKER]) return false;

        const pattern = normalizeCommandName(entry?.pattern);
        if (pattern === name) return true;

        return getCommandAliases(entry)
            .map(normalizeCommandName)
            .includes(name);
    });
}

function findCustomCommandInMemory(commandName) {
    const name = normalizeCommandName(commandName);
    return commands.find((entry) =>
        entry?.[CUSTOM_MARKER] === true &&
        normalizeCommandName(entry.pattern) === name
    );
}

function registerCustomCommand(commandName) {
    const name = normalizeCommandName(commandName);

    if (!name || isBuiltinCommand(name)) return false;
    if (findCustomCommandInMemory(name)) return true;

    const entry = cmd({
        pattern: name,
        alias: [],
        desc: 'Custom text command',
        category: 'custom',
        react: '📝',
        dontAddCommandList: true,
        filename: __filename
    }, async (conn, mek, m, { from, botNumber, reply }) => {
        try {
            const saved = await getCustomCommand(botNumber, name);
            if (!saved) return;

            await conn.sendMessage(from, {
                text: saved.response
            }, { quoted: mek });
        } catch (error) {
            console.error(`[CustomCommand:${name}]`, error);
            await reply('❌ Failed to load this custom command response.');
        }
    });

    entry[CUSTOM_MARKER] = true;
    return true;
}

async function unregisterCustomCommandIfUnused(commandName) {
    const name = normalizeCommandName(commandName);
    const count = await countCommandUsageAcrossBots(name);
    if (count > 0) return;

    for (let i = commands.length - 1; i >= 0; i--) {
        if (
            commands[i]?.[CUSTOM_MARKER] === true &&
            normalizeCommandName(commands[i].pattern) === name
        ) {
            commands.splice(i, 1);
        }
    }
}

function parsePipePayload(body) {
    const raw = String(body || '');
    const firstWhitespace = raw.search(/\s/);
    const payload = firstWhitespace === -1 ? '' : raw.slice(firstWhitespace).trimStart();
    const separatorIndex = payload.indexOf('|');

    if (separatorIndex === -1) {
        return { command: '', response: '', hasSeparator: false };
    }

    const command = payload.slice(0, separatorIndex).trim();
    let response = payload.slice(separatorIndex + 1);

    // Remove only the conventional single separator-space; preserve all other
    // whitespace, line breaks, emojis and Unicode exactly as supplied.
    if (response.startsWith(' ')) response = response.slice(1);

    return { command, response, hasSeparator: true };
}

function parseSingleCommand(body) {
    const raw = String(body || '');
    const firstWhitespace = raw.search(/\s/);
    if (firstWhitespace === -1) return '';
    return raw.slice(firstWhitespace).trim().split(/\s+/)[0] || '';
}

function ownerOnly(isOwner, reply) {
    if (isOwner) return true;
    reply('🚫 This command is owner-only.');
    return false;
}

// ==================== ADD CUSTOM COMMAND ====================
cmd({
    pattern: 'addcmd',
    alias: ['addcommand'],
    desc: 'Create a persistent custom text command',
    category: 'owner',
    react: '➕',
    filename: __filename
}, async (conn, mek, m, { body, isOwner, botNumber, reply }) => {
    if (!ownerOnly(isOwner, reply)) return;

    const { command, response, hasSeparator } = parsePipePayload(body);
    const validation = validateCommandName(command);

    if (!hasSeparator || !command) {
        return reply(`❌ Invalid format.\n\nExample:\n${config.PREFIX || '.'}addcmd rules | Group mein spam karna mana hai 🚫`);
    }

    if (!validation.valid) return reply(validation.error);
    if (!response.trim()) return reply('❌ Command response cannot be empty.');

    if (isBuiltinCommand(validation.command)) {
        return reply('❌ This command already exists as a built-in command.');
    }

    try {
        await addCustomCommand(botNumber, validation.command, response);
        registerCustomCommand(validation.command);
        return reply(`✅ Custom command added successfully!\n\nCommand: ${validation.command}`);
    } catch (error) {
        console.error('[CustomCommand] add error:', error);
        if (error.code === 'DUPLICATE_COMMAND') {
            return reply('❌ This custom command already exists.');
        }
        if (error.code === 'INVALID_COMMAND' || error.code === 'EMPTY_RESPONSE') {
            return reply(error.message);
        }
        return reply('❌ Storage/database error while saving the custom command.');
    }
});

// ==================== DELETE CUSTOM COMMAND ====================
cmd({
    pattern: 'delcmd',
    alias: ['delcommand', 'rmcmd'],
    desc: 'Delete a persistent custom text command',
    category: 'owner',
    react: '🗑️',
    filename: __filename
}, async (conn, mek, m, { body, isOwner, botNumber, reply }) => {
    if (!ownerOnly(isOwner, reply)) return;

    const command = parseSingleCommand(body);
    const validation = validateCommandName(command);

    if (!command) return reply(`❌ Please provide a command name.\nExample: ${config.PREFIX || '.'}delcmd rules`);
    if (!validation.valid) return reply(validation.error);

    try {
        await deleteCustomCommand(botNumber, validation.command);
        await unregisterCustomCommandIfUnused(validation.command);
        return reply('✅ Custom command deleted successfully.');
    } catch (error) {
        console.error('[CustomCommand] delete error:', error);
        if (error.code === 'COMMAND_NOT_FOUND') {
            return reply("❌ Custom command doesn't exist.");
        }
        return reply('❌ Storage/database error while deleting the custom command.');
    }
});

// ==================== EDIT CUSTOM COMMAND ====================
cmd({
    pattern: 'editcmd',
    alias: ['editcommand'],
    desc: 'Edit a persistent custom text command',
    category: 'owner',
    react: '✏️',
    filename: __filename
}, async (conn, mek, m, { body, isOwner, botNumber, reply }) => {
    if (!ownerOnly(isOwner, reply)) return;

    const { command, response, hasSeparator } = parsePipePayload(body);
    const validation = validateCommandName(command);

    if (!hasSeparator || !command) {
        return reply(`❌ Invalid format.\n\nExample:\n${config.PREFIX || '.'}editcmd rules | Updated Group Rules`);
    }

    if (!validation.valid) return reply(validation.error);
    if (!response.trim()) return reply('❌ Command response cannot be empty.');

    if (isBuiltinCommand(validation.command)) {
        return reply('❌ This command is a built-in command and cannot be edited here.');
    }

    try {
        await updateCustomCommand(botNumber, validation.command, response);
        registerCustomCommand(validation.command);
        return reply('✅ Custom command updated successfully.');
    } catch (error) {
        console.error('[CustomCommand] edit error:', error);
        if (error.code === 'COMMAND_NOT_FOUND') {
            return reply("❌ Custom command doesn't exist.");
        }
        if (error.code === 'INVALID_COMMAND' || error.code === 'EMPTY_RESPONSE') {
            return reply(error.message);
        }
        return reply('❌ Storage/database error while updating the custom command.');
    }
});

// ==================== LIST CUSTOM COMMANDS ====================
cmd({
    pattern: 'listcmd',
    alias: ['listcommands'],
    desc: 'List saved custom commands',
    category: 'owner',
    react: '📚',
    filename: __filename
}, async (conn, mek, m, { isOwner, botNumber, reply }) => {
    if (!ownerOnly(isOwner, reply)) return;

    try {
        const saved = await listCustomCommands(botNumber);

        if (!saved.length) {
            return reply('📚 CUSTOM COMMANDS\n\nNo custom commands saved yet.');
        }

        const lines = saved.map((item, index) => `${index + 1}. ${item.command}`);
        return reply(`📚 CUSTOM COMMANDS\n\n${lines.join('\n')}`);
    } catch (error) {
        console.error('[CustomCommand] list error:', error);
        return reply('❌ Storage/database error while loading custom commands.');
    }
});

// ==================== GET CUSTOM COMMAND ====================
cmd({
    pattern: 'getcmd',
    alias: ['getcommand'],
    desc: 'Show a saved custom command response',
    category: 'owner',
    react: '🔎',
    filename: __filename
}, async (conn, mek, m, { body, isOwner, botNumber, reply }) => {
    if (!ownerOnly(isOwner, reply)) return;

    const command = parseSingleCommand(body);
    const validation = validateCommandName(command);

    if (!command) return reply(`❌ Please provide a command name.\nExample: ${config.PREFIX || '.'}getcmd rules`);
    if (!validation.valid) return reply(validation.error);

    try {
        const saved = await getCustomCommand(botNumber, validation.command);
        if (!saved) return reply("❌ Custom command doesn't exist.");

        return reply(`📌 *Command:* ${saved.command}\n\n${saved.response}`);
    } catch (error) {
        console.error('[CustomCommand] get error:', error);
        return reply('❌ Storage/database error while loading the custom command.');
    }
});

// ==================== LOAD SAVED COMMAND NAMES ====================
(async () => {
    try {
        const ready = await waitForDatabase();
        if (!ready) {
            console.warn('[CustomCommand] MongoDB was not ready; saved commands will load after restart/reconnect.');
            return;
        }

        const names = await getAllCustomCommandNames();
        for (const name of names) registerCustomCommand(name);

        console.log(`[CustomCommand] Loaded ${names.length} saved command name(s).`);
    } catch (error) {
        console.error('[CustomCommand] Startup load error:', error.message);
    }
})();
