const axios = require("axios");

export default async function handler(req, res) {
  const { email, access_token, userURL, projectId } = req.body;

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

    // هنا نحط الفلترة بالتاريخ إذا بغيت
    const date = "06-01-2025";
    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}&date=${date}`;

    const logsRes = await axios.get(logsURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    res.json({
      userId: matchedUser.id,
      logs: logsRes.data
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
}
