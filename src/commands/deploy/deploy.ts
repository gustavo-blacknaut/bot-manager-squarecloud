import { SlashCommandBuilder, ChatInputCommandInteraction, ChannelType, PermissionsBitField, EmbedBuilder } from 'discord.js';
import logger, { auditLog } from '../../services/logger.service';
import { prisma } from '../../services/prisma';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('deploy')
        .setDescription('Inicia um novo processo de deploy de aplicação.'),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });

        try {
            const guildConfig = await prisma.guildConfig.findUnique({ where: { guildId: interaction.guildId! } });
            if (!guildConfig?.ticketCategoryId || !guildConfig.deployPrice) {
                return await interaction.editReply({ content: '❌ O sistema de deploy não foi configurado corretamente neste servidor.' });
            }

            const userRecord = await prisma.user.findUnique({ where: { discordId: interaction.user.id }, include: { squareCloudKey: true } });
            if (!userRecord?.squareCloudKey) {
                return await interaction.editReply({ content: '❌ Você precisa configurar sua chave da Square Cloud primeiro. Use o comando `/key`.' });
            }

            const openTicket = await prisma.deployTicket.findFirst({ where: { userId: userRecord.id, status: { notIn: ['COMPLETED', 'FAILED', 'EXPIRED'] } } });
            if (openTicket) {
                return await interaction.editReply({ content: `❌ Você já possui um ticket de deploy aberto em <#${openTicket.channelId}>.` });
            }

            const ticketChannel = await interaction.guild!.channels.create({
                name: `deploy-${interaction.user.username}`,
                type: ChannelType.GuildText,
                parent: guildConfig.ticketCategoryId,
                permissionOverwrites: [
                    { id: interaction.guildId!, deny: [PermissionsBitField.Flags.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles] },
                    { id: interaction.client.user!.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] }
                ],
            });

            const newTicket = await prisma.deployTicket.create({
                data: {
                    channelId: ticketChannel.id,
                    userId: userRecord.id,
                    guildId: interaction.guildId!,
                }
            });

            const embed = new EmbedBuilder()
                .setTitle('Ticket de Deploy Criado')
                .setDescription('Bem-vindo! Por favor, envie o seu arquivo `.zip` neste canal para iniciarmos o processo.')
                .setColor('#5865F2')
                .setFooter({ text: `Ticket ID: ${newTicket.id}` });

            await ticketChannel.send({ embeds: [embed] });
            await interaction.editReply({ content: `✅ Seu ticket de deploy foi criado: ${ticketChannel}` });
            await auditLog('INFO', 'Ticket de deploy criado.', { ticketId: newTicket.id }, userRecord.discordId);

        } catch (error) {
            logger.error('Falha ao criar ticket de deploy', { error, userId: interaction.user.id, guildId: interaction.guildId });
            throw error;
        }
    }
};
