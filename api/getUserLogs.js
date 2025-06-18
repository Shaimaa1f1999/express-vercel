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

    // نحسب المدى الزمني من selectdate
    const startDate = new Date(selectdate);
    const endDate = new Date(startDate);

    let daysAdded = 0;
    while (daysAdded < 5) {
      endDate.setDate(endDate.getDate() + 1);
      const day = endDate.getDay(); // 0 = أحد, 5 = جمعة, 6 = سبت
      if (day !== 5 && day !== 6) {
        daysAdded++;
      }
    }

    // صيغة yyyy-MM-dd
    const formatDate = (date) => date.toISOString().split("T")[0];

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}&view_type=custom&from_date=${formatDate(startDate)}&to_date=${formatDate(endDate)}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
