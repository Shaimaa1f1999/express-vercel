const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId, selectdate, durationType } = req.body;

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

    const viewType = durationType?.toLowerCase() === "month" ? "month" : "week";

    // ✅ تعديل التاريخ: تحويل من MM/dd/yyyy إلى yyyy-MM-dd
    const inputDate = new Date(selectdate);
    if (isNaN(inputDate)) {
      return res.status(400).json({ error: "Invalid date format. Expected MM/dd/yyyy" });
    }
    const formattedDate = inputDate.toISOString().split('T')[0]; // yyyy-MM-dd

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}&view_type=${viewType}&date=${formattedDate}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
