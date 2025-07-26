import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { readdirSync } from 'fs';
import { join } from 'path';
import logger from './services/logger.service';

const commands = [];
const foldersPath = join(__dirname, 'commands');
const commandFolders = readdirSync(foldersPath);

for (const folder of commandFolders) {
    const commandsPath = join(foldersPath, folder);
    const commandFiles = readdirSync(commandsPath).filter(file => file.endsWith('.ts') || file.endsWith('.js'));
    for (const file of commandFiles) {
        try {
            const filePath = join(commandsPath, file);
            const command = require(filePath);
            if ('data' in command && 'execute' in command) {
                commands.push(command.data.toJSON());
            } else {
                logger.warn(`O comando em ${filePath} está faltando a propriedade "data" ou "execute".`);
            }
        } catch (error) {
            logger.error(`Erro ao carregar o comando em ${file}`, { error });
        }
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        logger.info(`Iniciando a atualização de ${commands.length} comandos de aplicação (/).`);

        const data: any = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID!),
            { body: commands },
        );

        logger.info(`Sucesso ao recarregar ${data.length} comandos de aplicação (/).`);
    } catch (error) {
        logger.error('Falha ao registrar comandos de aplicação', { error });
    }
})();
