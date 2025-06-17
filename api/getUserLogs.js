const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId, selectdate } = req.body;

  try {
    // ✅ Get user list
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

    // ✅ Get from_date and to_date (week range from selected date)
    const startDate = new Date(selectdate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const from_date = selectdate;
    const to_date = endDate.toISOString().slice(0, 10);

    // ✅ Build logs URL using custom range
    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}&view_type=custom&from_date=${from_date}&to_date=${to_date}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
