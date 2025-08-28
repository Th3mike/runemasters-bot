const {
  Client,
  GatewayIntentBits,
  PermissionsBitField,
  EmbedBuilder,
} = require("discord.js");
const express = require("express");
const cors = require("cors");

const app = express();

// ⚠️ ordem importa → CORS antes das rotas
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use(express.json());

// --- Discord Bot Setup ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers, // precisa do "Server Members Intent" habilitado no portal dev
  ],
});

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;
const ORDERS_CHANNEL_ID = process.env.ORDERS_CHANNEL_ID;

// Cooldown em memória
const cooldowns = new Map();

// --- Endpoint principal para pedidos ---
app.options("/order", cors());
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
    return res.status(429).json({
      error: "Você só pode abrir outro ticket em 5 minutos.",
    });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);

    let member;
    try {
      member = await guild.members.fetch(userId);
    } catch (err) {
      console.warn(`Usuário ${userId} não está no servidor.`);
      return res.status(400).json({
        error:
          "Você precisa entrar no servidor do Discord antes de abrir um ticket.",
      });
    }

    // 1️⃣ Logar pedido num canal fixo
    if (ORDERS_CHANNEL_ID) {
      const ordersChannel = await guild.channels.fetch(ORDERS_CHANNEL_ID);

      const embed = new EmbedBuilder()
        .setColor(0x9b59b6)
        .setTitle("📦 Novo Pedido")
        .setDescription(`Pedido de **${user.username}**`)
        .setThumbnail(
          user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
            : member.user.displayAvatarURL()
        )
        .addFields(
          //{ name: "🔪 Melee", value: formData.meleeWeapon || "Nenhum", inline: true },
          { name: "🔪 Melee", value: formData?.meleeWeapon || "Nenhum", inline: true },
          { name: "🏹 Bow", value: formData.bow || "Nenhum", inline: true },
          { name: "💎 Amuleto", value: formData.amulet || "Nenhum", inline: true },
          {
            name: "📊 Stats",
            value:
              `Atk: ${formData.stats.attack}\n` +
              `Str: ${formData.stats.strength}\n` +
              `Def: ${formData.stats.defence}\n` +
              `HP: ${formData.stats.hitpoints}\n` +
              `Pray: ${formData.stats.prayer}\n` +
              `Mag: ${formData.stats.magic}\n` +
              `Range: ${formData.stats.ranged}`,
            inline: false,
          },
          { name: "📡 Parsec", value: formData.useParsec ? "Sim" : "Não", inline: true },
          { name: "🙏 Cox Prayers", value: formData.coxPrayers ? "Sim" : "Não", inline: true },
          { name: "🏹 Blowpipe", value: formData.hasBlowpipe ? `Sim (${formData.blowpipeDart})` : "Não", inline: true },
          { name: "💸 Preço", value: `${price}M`, inline: true }
        )
        .setTimestamp();

      await ordersChannel.send({ embeds: [embed] });
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

    const ticketEmbed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("🎫 Pedido Registrado")
      .setDescription(
        `Olá <@${userId}>, seu pedido foi registrado!\nNossa staff vai entrar em contato em breve.`
      )
      .setThumbnail(
        user.avatar
          ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
          : member.user.displayAvatarURL()
      )
      .addFields(
        { name: "🔪 Melee", value: formData.meleeWeapon || "Nenhum", inline: true },
        { name: "🏹 Bow", value: formData.bow || "Nenhum", inline: true },
        { name: "💎 Amuleto", value: formData.amulet || "Nenhum", inline: true },
        {
          name: "📊 Stats",
          value:
            `Atk: ${formData.stats.attack}\n` +
            `Str: ${formData.stats.strength}\n` +
            `Def: ${formData.stats.defence}\n` +
            `HP: ${formData.stats.hitpoints}\n` +
            `Pray: ${formData.stats.prayer}\n` +
            `Mag: ${formData.stats.magic}\n` +
            `Range: ${formData.stats.ranged}`,
          inline: false,
        },
        { name: "📡 Parsec", value: formData.useParsec ? "Sim" : "Não", inline: true },
        { name: "🙏 Cox Prayers", value: formData.coxPrayers ? "Sim" : "Não", inline: true },
        { name: "🏹 Blowpipe", value: formData.hasBlowpipe ? `Sim (${formData.blowpipeDart})` : "Não", inline: true },
        { name: "💸 Preço", value: `${price}M`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [ticketEmbed] });

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

// --- Comando !close para fechar tickets ---
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith("!close")) return;

  const channel = message.channel;

  if (!channel.name.startsWith("ticket-")) {
    return message.reply("❌ Este canal não é um ticket.");
  }

  const member = await channel.guild.members.fetch(message.author.id);
  const isStaff = member.roles.cache.has(STAFF_ROLE_ID);

  if (!isStaff && !channel.permissionsFor(message.author.id)?.has("ManageChannels")) {
    if (!channel.name.includes(message.author.username.toLowerCase())) {
      return message.reply("❌ Apenas staff ou o dono do ticket podem fechar este canal.");
    }
  }

  await message.reply("🔒 Fechando o ticket em 5 segundos...");
  setTimeout(() => channel.delete().catch(() => {}), 5000);
});

client.login(TOKEN);
