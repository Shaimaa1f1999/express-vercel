module.exports = async (req, res) => {
  const { email, token, projects, projectName } = req.body;
  const portal = "alnafithait";

  try {
    const matched = projects.find(p => p.name === projectName);

    if (!matched || !matched.id_string || !matched.userURL) {
      return res.status(400).json({ error: "Missing or invalid project data" });
    }

    // بناء الرابط فقط بدون استدعاء API
    const logsURL = `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${matched.id_string}/logs/`;

    res.json({
      email,
      projectName,
      logsURL
    });

  } catch (err) {
    console.error("Error:", err.message || err.response?.data);
    res.status(500).json({ error: "Server error", details: err.message || err.response?.data });
  }
};
