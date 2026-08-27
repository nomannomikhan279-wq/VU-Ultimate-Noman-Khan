var commands = [];

function cmd(info, func) {
    var data = { ...(info || {}) };
    data.function = func;

    if (!data.pattern && data.cmdname) data.pattern = data.cmdname;
    if (data.pattern) data.pattern = String(data.pattern).trim().toLowerCase();
    data.alias = Array.isArray(data.alias) ? data.alias.map(a => String(a).trim().toLowerCase()) : [];
    data.dontAddCommandList = Boolean(data.dontAddCommandList);
    data.desc = data.desc || '';
    data.fromMe = Boolean(data.fromMe);
    data.category = data.category || 'misc';

    commands.push(data);
    return data;
}

module.exports = { cmd, AddCommand: cmd, Function: cmd, commands };
