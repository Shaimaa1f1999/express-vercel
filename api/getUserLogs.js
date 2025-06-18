const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId, durationType, selectdate } = req.body;

  try {
    const usersRes = await axios.get(userURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    const matchedUser = usersRes.data.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!matchedUser) {
      return res.status(404).json({ error: "User not found in this project" });
    }

    // لو ما أرسلت تواريخ نستخدم الافتراضيين
    const startDate = selectdate?.start || "06-17-2025";
    const endDate = selectdate?.end || "06-22-2025";

    // بدل ما تستخدم القيمة المرسلة نخليها "custom" مؤقتًا
    const viewType = "custom_date";

    // نحط custom_date كـ encoded JSON string بدون علامات اقتباس
    const custom_date = `{start_date:${startDate},end_date:${endDate}}`;
    const encoded = encodeURIComponent(custom_date);

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs?users_list=${matchedUser.id}&view_type=${viewType}&date=${startDate}&custom_date=${encoded}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
