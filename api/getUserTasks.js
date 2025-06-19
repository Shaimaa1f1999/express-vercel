const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId } = req.body;

  try {
    // Step 1: Get the list of users from the project
    const usersRes = await axios.get(userURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    // Step 2: Find user by email
    const matchedUser = usersRes.data.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!matchedUser) {
      return res.status(404).json({ error: "User not found in this project" });
    }

    // Step 3: Build task URL
    const tasksURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/tasks/?users_list=${matchedUser.id}`;

    // Step 4: Return user ID and task link
    res.json({
      userId: matchedUser.id,
      tasksLink: tasksURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or tasks." });
  }
};
