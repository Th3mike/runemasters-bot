const express = require("express");
const router = express.Router();

module.exports = (client, cooldowns, config) => {
  const {
    GUILD_ID,
    CATEGORY_ID,
    STAFF_ROLE_ID,
    ORDERS_CHANNEL_ID,
    ROLE_TO_ASSIGN_ID,
  } = config;

  function formatWeaponName(name) {
    if (!name) return "Nenhum";
    return name
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  function generateEmbed(
    user,
    member,
    formData,
    price,
    orderType,
    isTicket = false
  ) {
    const avatarUrl =
      user.avatar || member.user.displayAvatarURL({ dynamic: true, size: 256 });

    const baseEmbed = {
      color: isTicket ? 0x2ecc71 : 0x9b59b6,
      title: isTicket
        ? "🎫 Pedido Registrado"
        : `📦 Novo Pedido - ${orderType.toUpperCase()}`,
      description: isTicket
        ? `Olá <@${user.discordId}>, seu pedido foi registrado!\nNossa staff <@&1410524237009260545> vai entrar em contato em breve.`
        : `Pedido de **${user.username}**`,
      thumbnail: { url: avatarUrl },
      fields: [],
      timestamp: new Date(),
    };

    const stats = formData.stats || {};
    const statsField = {
      name: "📊 Stats",
      value:
        `Def: ${stats.defence || "?"}\n` +
        `HP: ${stats.hitpoints || "?"}\n` +
        `Pray: ${stats.prayer || "?"}\n` +
        `Mag: ${stats.magic || "?"}\n` +
        `Range: ${stats.ranged || "?"}`,
    };

    const parsecField = {
      name: "📡 Parsec",
      value: formData.useParsec ? "Sim" : "Não",
      inline: true,
    };

    const priceField = {
      name: "💸 Preço",
      value: `${price}M`,
      inline: true,
    };

    if (orderType === "others") {
      baseEmbed.fields.push(
        isTicket && {
          name: "🛠️ Tipo de Serviço",
          value: "Personalizado",
        },
        {
          name: "👤 Tipo de Conta",
          value: formData.accountType || "Não informado",
          inline: true,
        },
        {
          name: "📝 Descrição",
          value: formData.description || "Nenhuma descrição fornecida",
        },
        statsField,
        parsecField,
        priceField
      );
    } else {
      baseEmbed.fields.push(
        isTicket && {
          name: "🛠️ Tipo de Serviço",
          value:
            orderType === "quiver"
              ? "Quiver"
              : orderType === "inferno"
              ? "Inferno"
              : orderType,
        },
        {
          name: "🔪 Melee",
          value: formatWeaponName(formData?.meleeWeapon),
          inline: true,
        },
        {
          name: "🏹 Bow",
          value: formatWeaponName(formData?.bow),
          inline: true,
        },
        {
          name: "💎 Amuleto",
          value: formatWeaponName(formData?.amulet),
          inline: true,
        },
        statsField,
        parsecField,
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
        priceField
      );
    }

    // Remove any falsy fields
    baseEmbed.fields = baseEmbed.fields.filter(Boolean);
    return baseEmbed;
  }

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

      let embed;
      if (ORDERS_CHANNEL_ID) {
        const ordersChannel = await guild.channels.fetch(ORDERS_CHANNEL_ID);
        embed = generateEmbed(user, member, formData, price, orderType);
        await ordersChannel.send({ embeds: [embed] });
      }

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

      const ticketEmbed = generateEmbed(
        user,
        member,
        formData,
        price,
        orderType,
        true
      );
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

  // POST /check-membership
  router.post("/check-membership", async (req, res) => {
    const { discordId } = req.body;

    if (!discordId) {
      console.log("check-membership: discordId não fornecido");
      return res.status(400).json({ error: "discordId é obrigatório." });
    }

    try {
      const guild = await client.guilds.fetch(config.GUILD_ID);
      const member = await guild.members.fetch(discordId);
      console.log(`check-membership: Usuário ${discordId} está no servidor.`);
      return res.json({ inGuild: !!member });
    } catch (error) {
      console.log(
        `check-membership: Usuário ${discordId} não está no servidor ou erro:`,
        error.message
      );
      return res.json({ inGuild: false });
    }
  });

  // GET /feedbacks
  router.get("/feedbacks", async (req, res) => {
    try {
      const feedbackChannel = await client.channels.fetch(
        config.FEEDBACK_CHANNEL_ID
      );
      const messages = await feedbackChannel.messages.fetch({ limit: 20 });

      const feedbacks = [];

      messages.forEach((msg) => {
        const embed = msg.embeds[0];
        if (!embed) return;

        const ratingField = embed.fields.find((f) => f.name === "Nota");
        const commentField = embed.fields.find((f) => f.name === "Comentário");

        feedbacks.push({
          username: embed.author?.name || "Anônimo",
          avatar: embed.author?.icon_url || "https://i.imgur.com/9UQhVJ0.png",
          rating: ratingField?.value || "",
          comment: commentField?.value || "",
          date: embed.timestamp || msg.createdTimestamp,
        });
      });

      return res.json({ feedbacks });
    } catch (err) {
      console.error("Erro ao buscar feedbacks:", err);
      return res.status(500).json({ error: "Erro ao buscar feedbacks." });
    }
  });

  return router;
};
