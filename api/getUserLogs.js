const axios = require("axios");

export default async function handler(req, res) {
  const { email, access_token, userURL, projectId } = req.body;

  try {
    // ✅ أضيفي هذا السطر لتصحيح URL:
    const finalURL = userURL.endsWith('/') ? userURL : userURL + '/';

    const response = await axios.get(finalURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    const matchedUser = response.data.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!matchedUser) {
      return res.status(404).json({ error: "User not found in this project" });
    }

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}`;

    res.json({
      userId: matchedUser.id,
      logsURL
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
}
