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

    const viewTypeRaw = durationType?.toLowerCase();
    const viewType = "custom_date"; // نغيره مؤقتاً لتجربة custom date

    // نجهز التاريخين
    const start = selectdate?.start || "06-17-2025";
    const end = selectdate?.end || "06-22-2025";

    // نبني الـ custom_date كـ JSON ونشفّره
    const customDateObj = { start_date: start, end_date: end };
    const encodedCustomDate = encodeURIComponent(JSON.stringify(customDateObj));

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs?users_list=${matchedUser.id}&view_type=custom_date&date=${start}&custom_date=${encodedCustomDate}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
