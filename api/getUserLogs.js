const axios = require("axios");

module.exports = async (req, res) => {
  const { projectName, projectId, userURL, email, access_token } = req.body;

  if (!projectId || !userURL || !email || !access_token) {
    return res.status(400).json({ error: "Missing input" });
  }

  const token = `Zoho-oauthtoken ${access_token}`;
  const portal = "alnafithait"; // غيره إذا عندكم غير

  try {
    // 1. Get users from userURL
    const usersRes = await axios.get(userURL, {
      headers: {
        Authorization: token
      }
    });

    const user = usersRes.data.users.find(u => u.email === email);
    if (!user) {
      return res.status(404).json({ error: "User not found in project" });
    }

    const userId = user.id;

    // 2. Get logs for that user
    const logsRes = await axios.get(`https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${projectId}/logs/?user=${userId}`, {
      headers: {
        Authorization: token
      }
    });

    return res.status(200).json({
      userId,
      projectId,
      logs: logsRes.data.timelogs
    });

  } catch (err) {
    console.error(err?.response?.data || err.message);
    return res.status(500).json({ error: "Something went wrong", details: err?.response?.data });
  }
};
