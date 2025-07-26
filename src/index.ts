import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, Partials } from 'discord.js';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './web/server';
import logger from './services/logger.service';
import { prisma } from './services/prisma';

process.on('uncaughtException', (error) => {
    logger.crit('UNCAUGHT EXCEPTION! O bot vai desligar.', { error });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED REJECTION! Promise não tratada.', { reason });
});

export class CustomClient extends Client {
    commands = new Collection<string, any>();
}

const client = new CustomClient({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ],
    partials: [Partials.Channel]
});

const loadModules = (dir: string, collection?: Collection<string, any>) => {
    const path = join(__dirname, dir);
    const folders = readdirSync(path);

    for (const folder of folders) {
        try {
            const subPath = join(path, folder);
            const files = readdirSync(subPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
            for (const file of files) {
                const filePath = join(subPath, file);
                const module = require(filePath);
                if (collection && module.data) {
                    collection.set(module.data.name, module);
                }
            }
        } catch (error) {
            logger.error(`Erro ao carregar módulos no diretório ${folder}`, { error });
        }
    }
}

const handlersPath = join(__dirname, 'handlers');
const handlerFiles = readdirSync(handlersPath).filter(file => file.endsWith('.js') || file.endsWith('.ts'));
for (const file of handlerFiles) {
    try {
        const filePath = join(handlersPath, file);
        const event = require(filePath);
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    } catch (error) {
        logger.error(`Erro ao carregar o handler ${file}`, { error });
    }
}

loadModules('commands', client.commands);

try {
    startServer(client);
    client.login(process.env.DISCORD_TOKEN);
} catch (error) {
    logger.crit('Falha ao iniciar os serviços principais.', { error });
    process.exit(1);
}

const gracefulShutdown = async () => {
    logger.info('Recebido sinal de desligamento. Desligando graciosamente...');
    client.destroy();
    await prisma.$disconnect();
    process.exit(0);
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);