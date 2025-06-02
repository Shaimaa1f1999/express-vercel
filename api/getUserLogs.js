const axios = require('axios');

module.exports = async (req, res) => {
  const { email, token, projects, projectName } = req.body;
  const portal = "alnafithait";

  try {
    const matched = projects.find(p => p.name === projectName);

    if (!matched || !matched.id_string || !matched.userURL) {
      return res.status(400).json({ error: "Missing or invalid project data" });
    }

    // Get users
    const userRes = await axios.get(matched.userURL, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });

    const user = userRes.data?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(404).json({ error: "User not found in project" });
    }

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${matched.id_string}/logs/?user=${user.id}`;

    res.json({
      email,
      projectName,
      userId: user.id,
      logsURL
    });

  } catch (err) {
    console.error("Error:", err.message || err.response?.data);
    res.status(500).json({ error: "Server error", details: err.message || err.response?.data });
  }
};
