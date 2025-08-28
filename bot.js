require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
} = require("discord.js");
const apiRoutes = require("./routes/api");

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://runemasters-bot.onrender.com",
      "*",
    ],
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// Discord Bot Setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const cooldowns = new Map();
const config = {
  GUILD_ID: process.env.GUILD_ID,
  CATEGORY_ID: process.env.CATEGORY_ID,
  STAFF_ROLE_ID: process.env.STAFF_ROLE_ID,
  ORDERS_CHANNEL_ID: process.env.ORDERS_CHANNEL_ID,
  ROLE_TO_ASSIGN_ID: "1410666933669462176", // sua nova role
  CLOSE_ROLE_ID: "1410524237009260545", // role autorizada para usar !close
  FEEDBACK_CHANNEL_ID: "1410747614143451196", // canal onde aparecem os feedbacks
};

// Carregar rotas da API
app.use("/", apiRoutes(client, cooldowns, config));

// Start Express Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

// Discord Bot Login
client.once("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

// !close command e !feedback command
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // !close
  if (message.content.startsWith("!close")) {
    const channel = message.channel;

    if (!channel.name.startsWith("ticket-")) {
      return message.reply("❌ Este canal não é um ticket.");
    }

    const member = await channel.guild.members.fetch(message.author.id);

    const canClose = member.roles.cache.has(config.CLOSE_ROLE_ID);

    if (!canClose) {
      return message.reply("❌ Você não tem permissão para fechar este ticket.");
    }

    await message.reply("🔒 Fechando o ticket em 5 segundos...");
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  // !feedback
  if (message.content === "!feedback") {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("feedback_with_user")
        .setLabel("Com usuário")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId("feedback_anonymous")
        .setLabel("Anônimo")
        .setStyle(ButtonStyle.Secondary)
    );

    await message.reply({
      content: "Como deseja enviar seu feedback?",
      components: [row],
      ephemeral: true,
    });
  }
});

// Listener para botões e modais
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    if (
      interaction.customId === "feedback_with_user" ||
      interaction.customId === "feedback_anonymous"
    ) {
      const modal = new ModalBuilder()
        .setCustomId(`modal_${interaction.customId}`)
        .setTitle("Envie seu feedback");

      const feedbackInput = new TextInputBuilder()
        .setCustomId("feedback_input")
        .setLabel("Digite seu feedback aqui")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setPlaceholder("Escreva seu feedback...");

      const firstActionRow = new ActionRowBuilder().addComponents(feedbackInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    if (
      interaction.customId === "modal_feedback_with_user" ||
      interaction.customId === "modal_feedback_anonymous"
    ) {
      const feedback = interaction.fields.getTextInputValue("feedback_input");
      try {
        const feedbackChannel = await client.channels.fetch(
          config.FEEDBACK_CHANNEL_ID
        );

        let content;
        if (interaction.customId === "modal_feedback_with_user") {
          content = `📢 **Feedback de:** <@${interaction.user.id}>\n\n${feedback}`;
        } else {
          content = `📢 **Feedback Anônimo:**\n\n${feedback}`;
        }

        await feedbackChannel.send({ content });

        await interaction.reply({
          content: "✅ Obrigado pelo seu feedback!",
          ephemeral: true,
        });
      } catch (error) {
        console.error("Erro ao enviar feedback:", error);
        await interaction.reply({
          content: "❌ Ocorreu um erro ao enviar o feedback.",
          ephemeral: true,
        });
      }
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
