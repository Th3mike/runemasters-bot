import express from "express";
import { Client, GatewayIntentBits, PermissionFlagsBits } from "discord.js";

const app = express();
app.use(express.json());

// Config
const TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CATEGORY_ID = process.env.CATEGORY_ID;
const STAFF_ROLE_ID = process.env.STAFF_ROLE_ID;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.login(TOKEN);

let cooldowns = new Map();

app.post("/order", async (req, res) => {
  const { user, formData, price } = req.body;

  if (!user || !user.discordId) {
    return res.status(400).send("Usuário inválido");
  }

  const now = Date.now();
  if (cooldowns.has(user.discordId) && now - cooldowns.get(user.discordId) < 5 * 60 * 1000) {
    return res.status(429).send("Aguarde 5 minutos antes de abrir outro ticket.");
  }
  cooldowns.set(user.discordId, now);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await guild.members.fetch(user.discordId);

    const channel = await guild.channels.create({
      name: `ticket-${member.user.username}`,
      parent: CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: member.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: STAFF_ROLE_ID,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
      ],
    });

    await channel.send(
      `📦 **Novo pedido de ${member}**\n` +
        `🔪 Weapon: ${formData.weapon || formData.meleeWeapon}\n` +
        `🏹 Bow: ${formData.bow || "Nenhuma"}\n` +
        `📊 Stats: ${JSON.stringify(formData.stats)}\n` +
        `💸 Preço: ${price}M\n` +
        `📡 Parsec: ${formData.isParsec || formData.useParsec ? "Sim" : "Não"}`
    );

    res.send({ success: true, channelId: channel.id });
  } catch (err) {
    console.error(err);
    res.status(500).send("Erro ao criar ticket.");
  }
});

app.listen(3000, () => console.log("Bot rodando 🚀"));
