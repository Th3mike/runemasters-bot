// routes/api.js
const express = require("express");
const router = express.Router();

module.exports = (client, cooldowns, config) => {
  const {
    GUILD_ID,
    CATEGORY_ID,
    STAFF_ROLE_ID,
    ORDERS_CHANNEL_ID,
    ROLE_TO_ASSIGN_ID, // 👈 nova role para atribuição automática
  } = config;

  // POST /order
  router.post("/order", async (req, res) => {
    const { user, formData, price, orderType } = req.body;

    if (!user || !user.discordId || !orderType) {
      return res
        .status(400)
        .json({ error: "user.discordId e orderType são obrigatórios" });
    }

    const userId = user.discordId;
    const now = Date.now();
    const lastTicket = cooldowns.get(userId);

    if (lastTicket && now - lastTicket < 1 * 60 * 1000) {
      return res.status(429).json({
        error: "Você só pode abrir outro ticket em 1 minuto.",
      });
    }

    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(userId);

      // Declarar embed para uso depois do if
      let embed;

      if (ORDERS_CHANNEL_ID) {
        const ordersChannel = await guild.channels.fetch(ORDERS_CHANNEL_ID);

        embed = {
          color: 0x9b59b6,
          title: `📦 Novo Pedido - ${orderType.toUpperCase()}`,
          description: `Pedido de **${user.username}**`,
          thumbnail: {
            url:
              user.avatar ||
              member.user.displayAvatarURL({ dynamic: true, size: 256 }),
          },
          fields: [
            {
              name: "🔪 Melee",
              value: formData?.meleeWeapon || "Nenhum",
              inline: true,
            },
            {
              name: "🏹 Bow",
              value: formData?.bow || "Nenhum",
              inline: true,
            },
            {
              name: "💎 Amuleto",
              value: formData?.amulet || "Nenhum",
              inline: true,
            },
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
            },
            {
              name: "📡 Parsec",
              value: formData.useParsec ? "Sim" : "Não",
              inline: true,
            },
            {
              name: "🙏 Cox Prayers",
              value: formData.coxPrayers ? "Sim" : "Não",
              inline: true,
            },
            {
              name: "🏹 Blowpipe",
              value: formData.hasBlowpipe
                ? `Sim (${formData.blowpipeDart})`
                : "Não",
              inline: true,
            },
            { name: "💸 Preço", value: `${price}M`, inline: true },
          ],
          timestamp: new Date(),
        };

        await ordersChannel.send({ embeds: [embed] });
      } else {
        // Caso não tenha o canal, evitar erro definindo embed vazio
        embed = { fields: [] };
      }

      // Criar canal do ticket
      const ticketChannel = await guild.channels.create({
        name: `ticket-${member.user.username}`,
        type: 0,
        parent: CATEGORY_ID,
        permissionOverwrites: [
          {
            id: guild.roles.everyone.id,
            deny: ["ViewChannel"],
          },
          {
            id: userId,
            allow: ["ViewChannel", "SendMessages"],
          },
          {
            id: STAFF_ROLE_ID,
            allow: ["ViewChannel", "SendMessages"],
          },
        ],
      });

      const ticketEmbed = {
        color: 0x2ecc71,
        title: "🎫 Pedido Registrado",
        description: `Olá <@${userId}>, seu pedido foi registrado!\nNossa staff vai entrar em contato em breve.`,
        thumbnail: {
          url:
            user.avatar ||
            member.user.displayAvatarURL({ dynamic: true, size: 256 }),
        },
        fields: [
          {
            name: "🔪 Melee",
            value: formData?.meleeWeapon || "Nenhum",
            inline: true,
          },
          {
            name: "🏹 Bow",
            value: formData?.bow || "Nenhum",
            inline: true,
          },
          {
            name: "💎 Amuleto",
            value: formData?.amulet || "Nenhum",
            inline: true,
          },
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
          },
          {
            name: "📡 Parsec",
            value: formData.useParsec ? "Sim" : "Não",
            inline: true,
          },
          {
            name: "🙏 Cox Prayers",
            value: formData.coxPrayers ? "Sim" : "Não",
            inline: true,
          },
          {
            name: "🏹 Blowpipe",
            value: formData.hasBlowpipe
              ? `Sim (${formData.blowpipeDart || "N/A"})`
              : "Não",
            inline: true,
          },
          {
            name: "💸 Preço",
            value: `${price}M`,
            inline: true,
          },
        ],
        timestamp: new Date(),
      };

      await ticketChannel.send({ embeds: [ticketEmbed] });

      cooldowns.set(userId, now);
      return res.json({ success: true, channelId: ticketChannel.id });
    } catch (err) {
      console.error("Erro ao criar ticket:", err);
      return res.status(500).json({ error: "Erro ao criar ticket" });
    }
  });

  // POST /assign-role
  router.post("/assign-role", async (req, res) => {
    const { discordId } = req.body;
    if (!discordId) {
      return res.status(400).json({ error: "discordId é obrigatório." });
    }

    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(discordId);
      await member.roles.add(ROLE_TO_ASSIGN_ID);

      return res.json({ success: true });
    } catch (error) {
      console.error("Erro ao adicionar role:", error);
      return res.status(500).json({ error: "Erro ao adicionar role." });
    }
  });

  router.post("/check-membership", async (req, res) => {
    const { discordId } = req.body;

    try {
      const guild = await client.guilds.fetch(config.GUILD_ID);
      const member = await guild.members.fetch(discordId);
      return res.json({ inGuild: !!member });
    } catch (error) {
      console.log("Usuário não está no servidor:", discordId);
      return res.json({ inGuild: false });
    }
  });

  return router;
};
