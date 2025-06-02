const axios = require("axios");

module.exports = async (req, res) => {
  const { projectName, email, projects, access_token } = req.body;

  if (!projectName || !email || !projects || !access_token) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const token = `Zoho-oauthtoken ${access_token}`;
  const portal = "alnafithait"; // غيّريه إذا مختلف

  try {
    // ✅ إذا projects عبارة عن { projects: [ ... ] }
    const projectArray = Array.isArray(projects) ? projects : projects.projects;

    const matchedProject = projectArray.find(p => p.name === projectName);
    if (!matchedProject) {
      return res.status(404).json({ error: "Project not found in list" });
    }

    const projectId = matchedProject.id_string;
    const userURL = matchedProject?.link?.user?.url;

    if (!projectId || !userURL) {
      return res.status(400).json({ error: "Missing projectId or userURL" });
    }

    // 2. جيب المستخدمين من المشروع
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

    // 3. جيب اللوق أورز لهالمستخدم
    const logsRes = await axios.get(
      `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${projectId}/logs/?user=${userId}`,
      {
        headers: {
          Authorization: token
        }
      }
    );

    return res.status(200).json({
      matchedProject: {
        name: projectName,
        projectId,
        userURL
      },
      matchedUser: {
        email,
        userId
      },
      logs: logsRes.data.timelogs
    });

  } catch (err) {
    console.error("Zoho API Error:", err?.response?.data || err.message);
    return res.status(500).json({
      error: "Something went wrong",
      details: err?.response?.data || err.message
    });
  }
};
