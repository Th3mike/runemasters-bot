// bot.js
const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
} = require("discord.js");
const express = require("express");
const cors = require("cors");

const app = express();

// ⚠️ ordem importa → CORS antes das rotas
app.use(cors({
  origin: "*", 
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// --- Discord Bot Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // precisa do "Server Members Intent" habilitado no portal dev
  ],
});

const TOKEN = process.env.DISCORD_TOKEN; // Coloque no Render
const GUILD_ID = process.env.GUILD_ID; 
const CATEGORY_ID = process.env.CATEGORY_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const ORDERS_CHANNEL_ID = process.env.ORDERS_CHANNEL_ID;

// Cooldown em memória
const cooldowns = new Map();

// --- Endpoint principal para pedidos ---
app.options("/order", cors()); // 👈 responde preflight
// --- Endpoint principal para pedidos ---
app.post("/order", async (req, res) => {
  const { user, formData, price } = req.body;

  if (!user || !user.discordId) {
    return res.status(400).json({ error: "user.discordId é obrigatório" });
  }

  const userId = user.discordId;
  const now = Date.now();
  const lastTicket = cooldowns.get(userId);

  // Cooldown de 5 minutos
  if (lastTicket && now - lastTicket < 5 * 60 * 1000) {
    return res
      .status(429)
      .json({ error: "Você só pode abrir outro ticket em 5 minutos." });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch (err) {
      console.warn(`Usuário ${userId} não está no servidor.`);
      return res.status(400).json({
        error: "Você precisa entrar no servidor do Discord antes de abrir um ticket."
      });
    }

    // 1️⃣ Logar pedido num canal fixo (opcional)
    if (ORDERS_CHANNEL_ID) {
      const ordersChannel = await guild.channels.fetch(ORDERS_CHANNEL_ID);
      await ordersChannel.send(
        `📦 **Novo pedido de ${member.user.tag}**\n` +
          `🔪 Melee: ${formData.meleeWeapon}\n` +
          `🏹 Bow: ${formData.bow || "Nenhuma"}\n` +
          `📊 Stats: Def ${formData.stats.defence}, HP ${formData.stats.hitpoints}, Pray ${formData.stats.prayer}, Mag ${formData.stats.magic}, Range ${formData.stats.ranged}\n` +
          `💎 Amuleto: ${formData.amulet || "Nenhum"}\n` +
          `💸 Preço: ${price}M\n` +
          `📡 Parsec: ${formData.useParsec ? "Sim" : "Não"}`
      );
    }

    // 2️⃣ Criar canal de ticket
    const channel = await guild.channels.create({
      name: `ticket-${member.user.username}`,
      type: 0, // 0 = text channel
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
          ],
        },
        {
          id: STAFF_ROLE_ID,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
          ],
        },
      ],
    });

    await channel.send(
      `🎫 Olá <@${userId}>, seu pedido foi registrado!\n` +
        `Nossa staff vai entrar em contato em breve.`
    );

    // Registrar cooldown
    cooldowns.set(userId, now);

    return res.json({ success: true, channelId: channel.id });
  } catch (err) {
    console.error("Erro ao criar ticket:", err);
    return res.status(500).json({ error: "Erro ao criar ticket" });
  }
});


// --- Inicializar servidor HTTP ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

// --- Login do bot ---
client.once("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

client.login(TOKEN);
