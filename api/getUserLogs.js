module.exports = async (req, res) => {
  const { email, token, projects, projectName, users } = req.body;
  const portal = "alnafithait";

  try {
    const matchedProject = projects.find(p => p.name === projectName);
    if (!matchedProject || !matchedProject.id_string) {
      return res.status(400).json({ error: "Invalid project data" });
    }

    const matchedUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!matchedUser || !matchedUser.id) {
      return res.status(400).json({ error: "User not found" });
    }

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${matchedProject.id_string}/logs/?users_list=${matchedUser.id}`;

    res.json({
      email,
      projectName,
      userId: matchedUser.id,
      logsURL
    });

  } catch (err) {
    console.error("Error:", err.message || err.response?.data);
    res.status(500).json({ error: "Server error", details: err.message || err.response?.data });
  }
};
