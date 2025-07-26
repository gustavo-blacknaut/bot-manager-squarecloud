import fastify from 'fastify';
import { CustomClient } from '../index';
import { setupRoutes } from './routes';
import logger from '../services/logger.service';

const server = fastify({ logger: { level: 'info' } });

export const startServer = (client: CustomClient) => {
    setupRoutes(server, client);
    const port = process.env.PORT || 3000;
    server.listen({ port: Number(port), host: '0.0.0.0' }, (err, address) => {
        if (err) {
            logger.crit('Erro ao iniciar servidor web', { err });
            process.exit(1);
        }
    });
};