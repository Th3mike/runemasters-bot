// index.js
import { Client, GatewayIntentBits, PermissionsBitField } from "discord.js";
import express from "express";

const app = express();
app.use(express.json());

// --- Discord Bot Setup ---
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const TOKEN = process.env.DISCORD_TOKEN; // Coloque no Render Dashboard
const GUILD_ID = process.env.GUILD_ID;   // ID do seu servidor
const CATEGORY_ID = process.env.CATEGORY_ID; // Categoria onde os tickets vão ser criados
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID; // Role da Staff que terá acesso

// Cooldown em memória
const cooldowns = new Map(); // userId -> timestamp

// --- API Endpoint para receber pedidos do frontend ---
app.post("/create-ticket", async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: "userId é obrigatório" });
  }

  const now = Date.now();
  const lastTicket = cooldowns.get(userId);

  // Verificar cooldown de 5 minutos
  if (lastTicket && now - lastTicket < 5 * 60 * 1000) {
    return res.status(429).json({ error: "Você só pode abrir outro ticket em 5 minutos." });
  }

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(userId);

    // Criar canal
    const channel = await guild.channels.create({
      name: `ticket-${member.user.username}`,
      type: 0, // 0 = text channel
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id, // @everyone sem acesso
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: userId, // Usuário com acesso
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
        {
          id: STAFF_ROLE_ID, // Staff com acesso
          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
        },
      ],
    });

    // Mensagem inicial
    await channel.send(`🎫 Olá <@${userId}>, seu ticket foi aberto! Aguarde a staff.`);

    // Registrar cooldown
    cooldowns.set(userId, now);

    return res.json({ success: true, channelId: channel.id });
  } catch (err) {
    console.error("Erro ao criar ticket:", err);
    return res.status(500).json({ error: "Erro ao criar ticket" });
  }
});

// --- Inicializar servidor HTTP (necessário pro Render) ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API rodando na porta ${PORT}`);
});

// --- Login do bot ---
client.once("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

client.login(TOKEN);
