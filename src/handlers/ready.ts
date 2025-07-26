import { Events } from 'discord.js';
import { CustomClient } from '../index';
import logger from '../services/logger.service';

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client: CustomClient) {
        logger.info(`[Bot] Logado como ${client.user?.tag}! Pronto para o trabalho.`);
    },
};