import { FastifyInstance, FastifyRequest } from 'fastify';
import { CustomClient } from '../index';
import { prisma } from '../services/prisma';
import { decrypt } from '../services/encryption.service';
import { SquareCloudAPI } from '@squarecloud/api';
import logger, { auditLog } from '../services/logger.service';
import { MercadoPagoConfig, Payment } from 'mercadopago';

interface MercadoPagoNotificationPayload {
    action?: string;
    data?: { id: string };
}

interface PushinPayPayload {
    status?: 'paid' | 'failed' | 'pending';
    reference_id?: string;
}

const TICKET_CLOSE_TIMEOUT = 300000; // 5 minutos em milissegundos

async function handleApprovedPayment(ticketId: string, provider: string, client: CustomClient) {
    const logMeta = { ticketId, provider };
    logger.info('Iniciando tratamento de pagamento aprovado', logMeta);

    const ticket = await prisma.deployTicket.findUnique({
        where: { id: ticketId, status: 'PENDING_PAYMENT' },
        include: { user: { include: { squareCloudKey: true } } }
    });

    if (!ticket) {
        return logger.warn('Webhook ignorado: ticket já processado ou inválido.', logMeta);
    }

    await prisma.deployTicket.update({
        where: { id: ticket.id },
        data: { status: 'DEPLOYING' }
    });

    const channel = await client.channels.fetch(ticket.channelId).catch(() => null) as any;
    if (channel) {
        await channel.send('✅ Pagamento confirmado! Iniciando o deploy final...');
    }

    await auditLog('INFO', 'Pagamento confirmado, iniciando deploy.', logMeta, ticket.user.discordId);

    try {
        if (!ticket.user.squareCloudKey) {
            throw new Error('Usuário não possui chave da Square Cloud configurada.');
        }

        const decryptedKey = decrypt(
            ticket.user.squareCloudKey.encryptedKey,
            ticket.user.squareCloudKey.iv
        );

        const api = new SquareCloudAPI(decryptedKey);

        if (!ticket.uploadedFileId) {
            throw new Error('ID do arquivo de deploy não encontrado.');
        }

        const application = await api.apps.create(ticket.uploadedFileId);

        await prisma.deployTicket.update({
            where: { id: ticket.id },
            data: { status: 'COMPLETED' }
        });

        const successMsg = `Deploy concluído! Sua aplicação **${application.tag}** está online. ID: \`${application.id}\``;

        if (channel) {
            await channel.send(`🚀 ${successMsg}\n\nEste canal será deletado em 5 minutos.`);
        }

        await auditLog('INFO', successMsg, { ...logMeta, appId: application.id }, ticket.user.discordId);
    } catch (err: any) {
        logger.error('Erro durante o deploy final', { ...logMeta, error: err.message });

        await prisma.deployTicket.update({
            where: { id: ticket.id },
            data: { status: 'FAILED' }
        });

        if (channel) {
            await channel.send(`❌ Falha no deploy. Motivo: ${err.message}\n\nEste canal será deletado em 5 minutos.`);
        }

        await auditLog('ERROR', `Falha no deploy final: ${err.message}`, logMeta, ticket.user.discordId);
    } finally {
        if (channel) {
            setTimeout(() => {
                channel.delete().catch((e: any) => logger.error(`Falha ao deletar o canal do ticket ${ticket.id}`, { error: e }));
            }, TICKET_CLOSE_TIMEOUT);
        }
    }
}

export function setupRoutes(server: FastifyInstance, client: CustomClient) {
    server.post('/webhook/mercadopago', async (request: FastifyRequest<{ Body: MercadoPagoNotificationPayload }>, reply) => {
        logger.info('Webhook do MercadoPago recebido', { body: request.body });

        if (!request.body?.action?.startsWith('payment.')) {
            return reply.code(200).send('OK. Action not relevant.');
        }

        const paymentId = request.body.data?.id;
        if (!paymentId) {
            logger.warn('Webhook do MP sem ID de pagamento.', { body: request.body });
            return reply.code(400).send('Bad Request: Payment ID not found.');
        }

        try {
            const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
            if (!accessToken) {
                logger.error('Access Token do MercadoPago não está configurado no .env');
                return reply.code(500).send('Internal Error: MP credentials not configured.');
            }

            const mpClient = new MercadoPagoConfig({ accessToken });
            const payment = new Payment(mpClient);
            const paymentDetails = await payment.get({ id: paymentId });
            
            const ticketId = paymentDetails.external_reference;

            if (paymentDetails.status === 'approved' && ticketId) {
                await handleApprovedPayment(ticketId, 'mercadopago', client);
            } else {
                logger.info(`Pagamento MP não aprovado (status: ${paymentDetails.status})`, { paymentId, ticketId });
            }

        } catch (error) {
            logger.error('Erro ao processar webhook do MercadoPago', { paymentId, error });
        }

        return reply.code(200).send('OK');
    });

    server.post('/webhook/pushinpay', async (request: FastifyRequest<{ Body: PushinPayPayload }>, reply) => {
        logger.info('Webhook do PushinPay recebido', { body: request.body });
        
        const { reference_id: ticketId, status } = request.body;

        if (!ticketId) {
            logger.warn('Webhook do PushinPay sem reference_id.', { body: request.body });
            return reply.code(400).send('Bad Request: reference_id not found.');
        }

        if (status === 'paid') {
            await handleApprovedPayment(ticketId, 'pushinpay', client);
        } else {
            logger.info(`Pagamento PushinPay não aprovado (status: ${status})`, { reference_id: ticketId });
        }
        
        return reply.code(200).send('OK');
    });
}
