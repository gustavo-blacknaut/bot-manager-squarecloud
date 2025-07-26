import { SlashCommandBuilder, ChatInputCommandInteraction, PermissionFlagsBits, ChannelType } from 'discord.js';
import logger, { auditLog } from '../../services/logger.service';
import { prisma } from '../../services/prisma';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('config')
        .setDescription('[Admin] Configurações do bot neste servidor.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(sub =>
            sub.setName('tickets')
                .setDescription('Define a categoria para criar os tickets de deploy.')
                .addChannelOption(option =>
                    option.setName('categoria')
                        .setDescription('A categoria onde os tickets serão abertos.')
                        .addChannelTypes(ChannelType.GuildCategory)
                        .setRequired(true)))
        .addSubcommand(sub =>
            sub.setName('preco')
                .setDescription('Define o preço para cada deploy.')
                .addNumberOption(option =>
                    option.setName('valor')
                        .setDescription('O preço em BRL (ex: 10.50).')
                        .setRequired(true))),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId!;
        const adminUserId = interaction.user.id;

        try {
            await prisma.guildConfig.upsert({
                where: { guildId },
                update: {},
                create: { guildId },
            });

            let logMessage = '';
            let logMeta: object = { guildId, adminUserId };

            if (subcommand === 'tickets') {
                const category = interaction.options.getChannel('categoria', true);
                await prisma.guildConfig.update({ where: { guildId }, data: { ticketCategoryId: category.id } });
                logMessage = `Categoria de tickets definida para ${category.name} (${category.id})`;
                await interaction.editReply({ content: `✅ ${logMessage}.` });
            }

            if (subcommand === 'preco') {
                const price = interaction.options.getNumber('valor', true);
                await prisma.guildConfig.update({ where: { guildId }, data: { deployPrice: price } });
                logMessage = `Preço por deploy definido para R$${price.toFixed(2)}`;
                await interaction.editReply({ content: `✅ ${logMessage}.` });
            }

            await auditLog('INFO', `Configuração do servidor atualizada: ${logMessage}`, logMeta, adminUserId);

        } catch (error) {
            logger.error('Falha ao executar comando /config', { error, guildId, adminUserId, subcommand });
            await interaction.editReply({ content: '❌ Ocorreu um erro ao processar sua solicitação.' });
        }
    }
};
