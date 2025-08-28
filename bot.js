require("dotenv").config();
const express = require("express");
const cors = require("cors");
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
} = require("discord.js");
const apiRoutes = require("./routes/api");

const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://runemasters-bot.onrender.com", 
      "*"
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
  ROLE_TO_ASSIGN_ID: "1410666933669462176", // 👈 sua nova role
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

// !close command
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!close")) return;

  const channel = message.channel;

  if (!channel.name.startsWith("ticket-")) {
    return message.reply("❌ Este canal não é um ticket.");
  }

  const member = await channel.guild.members.fetch(message.author.id);
  const isStaff = member.roles.cache.has(config.STAFF_ROLE_ID);

  if (
    !isStaff &&
    !channel.permissionsFor(message.author.id)?.has("ManageChannels")
  ) {
    if (!channel.name.includes(message.author.username.toLowerCase())) {
      return message.reply(
        "❌ Apenas staff ou o dono do ticket podem fechar este canal."
      );
    }
  }

  await message.reply("🔒 Fechando o ticket em 5 segundos...");
  setTimeout(() => channel.delete().catch(() => {}), 5000);
});

client.login(process.env.DISCORD_TOKEN);
