const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId, selectdate } = req.body;

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

    // نحسب 5 أيام عمل من تاريخ البداية
    const startDate = new Date(selectdate);
    let current = new Date(startDate);
    let count = 0;
    let endDate = new Date(current);

    while (count < 5) {
      const day = current.getDay();
      if (day !== 5 && day !== 6) { // نتجاوز الجمعة والسبت
        count++;
        endDate = new Date(current);
      }
      current.setDate(current.getDate() + 1);
    }

    const formatDate = d =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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
