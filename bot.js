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

// 👉 rota raiz para o auto-ping
app.get("/", (req, res) => {
  res.send("Bot ativo 🚀");
});

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

// Anti-duplicidade (no MESMO processo)
const handledMessages = new Set();

// Rotas da API
app.use("/", apiRoutes(client, cooldowns, config));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

// Mantém a aplicação acordada no Render (auto-ping a cada 10 min)
if (process.env.RENDER) {
  setInterval(() => {
    fetch("https://runemasters-bot.onrender.com")
      .then((res) => console.log("Ping OK:", res.status))
      .catch((err) => console.error("Ping falhou:", err));
  }, 10 * 60 * 1000); // 10 minutos
}

client.once("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

// Utils
function parseRating(input) {
  const num = Number(String(input).trim());
  if (!Number.isFinite(num)) return null;
  const clamped = Math.max(1, Math.min(5, Math.round(num)));
  return clamped;
}

function starsFromRating(r) {
  return "⭐".repeat(r) + "☆".repeat(5 - r);
}

// Comando !close e !feedback
client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.guild) return;

  // anti-duplicidade local (se o handler for acidentalmente registrado 2x)
  if (handledMessages.has(message.id)) return;

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
    handledMessages.add(message.id);
    setTimeout(() => handledMessages.delete(message.id), 60_000);

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
      content: "📬 Clique abaixo para enviar seu feedback:",
      components: [row],
    });
  }
});

// Interações: Botões e Modais
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.inGuild()) return;

  if (interaction.isButton()) {
    if (
      interaction.customId === "feedback_with_user" ||
      interaction.customId === "feedback_anonymous"
    ) {
      const modal = new ModalBuilder()
        .setCustomId(`modal_${interaction.customId}`)
        .setTitle("Avaliação de Serviço");

      const ratingInput = new TextInputBuilder()
        .setCustomId("rating_input")
        .setLabel("Nota (1-5)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Ex.: 5");

      const feedbackInput = new TextInputBuilder()
        .setCustomId("feedback_input")
        .setLabel("Comentário (opcional)")
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
    const ratingRaw = interaction.fields.getTextInputValue("rating_input");
    const rating = parseRating(ratingRaw);

    if (!rating) {
      return interaction.reply({
        content: "❌ Nota inválida. Digite um número de 1 a 5.",
        ephemeral: true,
      });
    }

    const feedback =
      interaction.fields.getTextInputValue("feedback_input")?.trim() ||
      "Sem comentário.";

    try {
      const feedbackChannel = await client.channels.fetch(
        config.FEEDBACK_CHANNEL_ID
      );

      const embed = new EmbedBuilder()
        .setColor(isWithUser ? 0x2ecc71 : 0x95a5a6)
        .setTitle("Review")
        .addFields(
          {
            name: "Nota",
            value: `${starsFromRating(rating)} \`(${rating}/5)\``,
            inline: true,
          },
          {
            name: "Comentário",
            value: feedback.length > 0 ? `> ${feedback}` : "—",
            inline: false,
          }
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

      // ✅ Responde ao usuário
      await interaction.reply({
        content: "✅ Obrigado pelo seu feedback!",
        ephemeral: true,
      });

      // ✅ Remove botões da mensagem original
      if (interaction.message) {
        await interaction.message.edit({
          content: "📬 Feedback já enviado ✅",
          components: [], // remove botões
        });
      }
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
