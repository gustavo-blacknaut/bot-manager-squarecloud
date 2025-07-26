import { Events, Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SquareCloudAPI } from '@squarecloud/api';
import { prisma } from '../services/prisma';
import { decrypt } from '../services/encryption.service';
import logger from '../services/logger.service';

module.exports = {
    name: Events.MessageCreate,
    async execute(message: Message) {
        if (message.author.bot || !message.guild) return;

        const ticket = await prisma.deployTicket.findFirst({
            where: {
                channelId: message.channel.id,
                status: 'PENDING_UPLOAD',
            },
            include: {
                user: {
                    include: {
                        squareCloudKey: true,
                    },
                },
            },
        });

        if (!ticket) return;

        const attachment = message.attachments.first();
        if (!attachment || !attachment.name.endsWith('.zip')) return;

        await message.author.send('✅ Arquivo `.zip` recebido! Processando upload...');

        try {
            if (!ticket.user.squareCloudKey) throw new Error('Chave da Square Cloud não encontrada para o usuário.');

            const decryptedKey = decrypt(ticket.user.squareCloudKey.encryptedKey, ticket.user.squareCloudKey.iv);
            const api = new SquareCloudAPI(decryptedKey);

            const response = await fetch(attachment.url);
            if (!response.ok) throw new Error(`Falha ao baixar o arquivo: ${response.status} ${response.statusText}`);

            const fileBuffer = Buffer.from(await response.arrayBuffer());
            const uploadedFile = await api.files.create(fileBuffer);

            await prisma.deployTicket.update({
                where: { id: ticket.id },
                data: {
                    status: 'PENDING_PAYMENT',
                    uploadedFileId: uploadedFile.id,
                },
            });

            const embed = new EmbedBuilder()
                .setTitle('Upload Concluído! Efetue o Pagamento')
                .setDescription('Seu arquivo foi enviado. Escolha um método de pagamento.')
                .setColor('#23a55a');

            const paymentButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pay_mp_${ticket.id}`)
                    .setLabel('MercadoPago')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('💳'),
                new ButtonBuilder()
                    .setCustomId(`pay_pp_${ticket.id}`)
                    .setLabel('PushinPay')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('💸')
            );

            await message.author.send({ embeds: [embed], components: [paymentButtons] });
        } catch (error) {
            const err = error as Error;
            logger.error('Erro no upload para Square Cloud', { error: err.message, ticketId: ticket.id });
            await message.author.send('❌ Ocorreu um erro ao fazer o upload. Verifique se sua chave `/key` é válida.');
        }
    },
};
