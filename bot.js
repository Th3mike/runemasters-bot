require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  Events,
  EmbedBuilder,
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
  ROLE_TO_ASSIGN_ID: "1410666933669462176",
  CLOSE_ROLE_ID: "1410524237009260545", // também usada como permissão para feedback
  FEEDBACK_CHANNEL_ID: "1410747614143451196",
};

// Rotas da API
app.use("/", apiRoutes(client, cooldowns, config));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

client.once("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

// Comando !close e !feedback
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const member = await message.guild.members.fetch(message.author.id);

  // !close
  if (message.content.startsWith("!close")) {
    const channel = message.channel;

    if (!channel.name.startsWith("ticket-")) {
      return message.reply("❌ Este canal não é um ticket.");
    }

    if (!member.roles.cache.has(config.CLOSE_ROLE_ID)) {
      return message.reply(
        "❌ Você não tem permissão para fechar este ticket."
      );
    }

    await message.reply("🔒 Fechando o ticket em 5 segundos...");
    setTimeout(() => channel.delete().catch(() => {}), 5000);
    return;
  }

  // !feedback → só staff pode abrir o painel
  if (message.content === "!feedback") {
    if (!member.roles.cache.has(config.CLOSE_ROLE_ID)) {
      return message.reply("❌ Você não tem permissão para usar este comando.");
    }

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
      content: "📩 Clique abaixo para enviar seu feedback:",
      components: [row],
    });
  }
});

// Interações: Botões e Modais
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isButton()) {
    // 👉 Removemos a checagem da role aqui, qualquer usuário pode clicar
    if (
      interaction.customId === "feedback_with_user" ||
      interaction.customId === "feedback_anonymous"
    ) {
      const modal = new ModalBuilder()
        .setCustomId(`modal_${interaction.customId}`)
        .setTitle("⭐ Avaliação de Serviço");

      const ratingInput = new TextInputBuilder()
        .setCustomId("rating_input")
        .setLabel("Nota (1-5 estrelas)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Ex: 5");

      const feedbackInput = new TextInputBuilder()
        .setCustomId("feedback_input")
        .setLabel("Comentário")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder("Escreva seu feedback...");

      modal.addComponents(
        new ActionRowBuilder().addComponents(ratingInput),
        new ActionRowBuilder().addComponents(feedbackInput)
      );

      await interaction.showModal(modal);
    }
  }

  if (interaction.isModalSubmit()) {
    const isWithUser = interaction.customId === "modal_feedback_with_user";
    const rating = interaction.fields.getTextInputValue("rating_input");
    const feedback =
      interaction.fields.getTextInputValue("feedback_input") ||
      "Sem comentário";

    try {
      const feedbackChannel = await client.channels.fetch(
        config.FEEDBACK_CHANNEL_ID
      );

      // converter número em estrelas
      const stars = "⭐".repeat(Math.min(Math.max(Number(rating), 1), 5));

      const embed = new EmbedBuilder()
        .setColor(isWithUser ? 0x2ecc71 : 0x95a5a6)
        .setTitle("📩 Novo Feedback")
        .addFields(
          { name: "⭐ Nota", value: stars, inline: true },
          { name: "💬 Comentário", value: `> ${feedback}`, inline: false }
        )
        .setTimestamp();

      if (isWithUser) {
        embed
          .setAuthor({
            name: interaction.user.username,
            iconURL: interaction.user.displayAvatarURL(),
          })
          .setFooter({ text: "📎 Enviado com identificação" });
      } else {
        embed
          .setAuthor({
            name: "Anônimo",
            iconURL: "https://i.imgur.com/9UQhVJ0.png",
          })
          .setFooter({ text: "📎 Enviado anonimamente" });
      }

      await feedbackChannel.send({ embeds: [embed] });

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
});

client.login(process.env.DISCORD_TOKEN);
