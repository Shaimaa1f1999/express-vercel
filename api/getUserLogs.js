const axios = require("axios");

export default async function handler(req, res) {
  const { email, access_token, userURL, projectId, date } = req.body;

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

    // رجّع اللينك فقط بدون ما تسوي request له
    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}&view_type=week&date=${date}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsURL: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to generate logs URL." });
  }
}
