import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SquareCloudAPI } from "@squarecloud/api"
import { prisma } from '../../services/prisma';
import { encrypt } from '../../services/encryption.service';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('key')
        .setDescription('Configure sua chave de API da Square Cloud.')
        .addStringOption(option =>
            option.setName('apikey')
                .setDescription('Sua chave de API encontrada no site da Square Cloud.')
                .setRequired(true)),
    async execute(interaction: ChatInputCommandInteraction) {
        await interaction.deferReply({ ephemeral: true });
        const apiKey = interaction.options.getString('apikey', true);

        try {
            const tempApi = new SquareCloudAPI(apiKey);
            await tempApi.users.get();
        } catch (error) {
            return interaction.editReply({ content: '❌ Chave de API inválida.' });
        }

        const { encrypted, iv } = encrypt(apiKey);
        const user = await prisma.user.upsert({
            where: { discordId: interaction.user.id },
            update: {},
            create: { discordId: interaction.user.id },
        });

        await prisma.squareCloudKey.upsert({
            where: { userId: user.id },
            update: { encryptedKey: encrypted, iv },
            create: { userId: user.id, encryptedKey: encrypted, iv },
        });
        
        await interaction.editReply({ content: '✅ Sua chave de API foi validada e salva com segurança!' });
    }
};

