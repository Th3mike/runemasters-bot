import express from "express";
import bodyParser from "body-parser";
import { Client, GatewayIntentBits, PermissionsBitField } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.once("ready", () => {
  console.log(`Bot logado como ${client.user.tag}`);
});

// ✅ Rota de status
app.get("/", (req, res) => {
  res.json({ status: "ok", bot: client.user?.tag || "iniciando..." });
});

// ✅ Rota de pedidos
app.post("/order", async (req, res) => {
  try {
    const { userId, username, formData, price } = req.body;

    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const category = guild.channels.cache.get(process.env.CATEGORY_ID);
    const staffRole = guild.roles.cache.get(process.env.STAFF_ROLE_ID);

    if (!guild || !category || !staffRole) {
      return res.status(400).json({ error: "Configuração inválida" });
    }

    // cria o canal com permissões
    const channel = await guild.channels.create({
      name: `ticket-${username}`,
      type: 0, // GUILD_TEXT
      parent: category.id,
      permissionOverwrites: [
        {
          id: guild.id,
          deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: userId,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
        {
          id: staffRole.id,
          allow: [PermissionsBitField.Flags.ViewChannel],
        },
      ],
    });

    await channel.send(
      `🎟️ Novo pedido de **${username}**!\n💰 Preço: ${price}M\n📋 Dados: \`\`\`${JSON.stringify(
        formData,
        null,
        2
      )}\`\`\``
    );

    res.json({ success: true, channel: channel.id });
  } catch (err) {
    console.error("Erro ao criar ticket:", err);
    res.status(500).json({ error: "Erro interno ao criar ticket" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

client.login(process.env.BOT_TOKEN);
