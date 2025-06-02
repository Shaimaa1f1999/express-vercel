const axios = require("axios");

module.exports = async (req, res) => {
  const { projectName, email, projects, access_token } = req.body;

  if (!projectName || !email || !projects || !access_token) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const token = `Zoho-oauthtoken ${access_token}`;
  const portal = "alnafithait";

  const today = new Date();
  const dayOfWeek = today.getDay();
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const mondayISO = monday.toISOString().split("T")[0];

  const lastMonth = new Date();
  lastMonth.setMonth(today.getMonth() - 1);
  lastMonth.setHours(0, 0, 0, 0);
  const lastMonthISO = lastMonth.toISOString().split("T")[0];

  try {
    const matchedProject = projects.find(p => p.name === projectName);
    if (!matchedProject) {
      return res.status(404).json({ error: "Project not found in provided list" });
    }

    const projectId = matchedProject.id_string;
    const userURL = matchedProject.userURL;

    if (!projectId || !userURL) {
      return res.status(400).json({ error: "Missing projectId or userURL" });
    }

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

    // 1. جرب تجيب اللوق أورز من بداية الأسبوع
    let logsRes = await axios.get(
      `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${projectId}/logs/?user=${userId}&view_type=custom&from_date=${mondayISO}`,
      {
        headers: { Authorization: token }
      }
    );

    let logs = logsRes.data.timelogs;

    // 2. لو ما فيه لوق أورز هذا الأسبوع، جرب الشهر الماضي
    if (!logs || logs.length === 0) {
      logsRes = await axios.get(
        `https://projectsapi.zoho.com/restapi/portal/${portal}/projects/${projectId}/logs/?user=${userId}&view_type=custom&from_date=${lastMonthISO}`,
        {
          headers: { Authorization: token }
        }
      );
      logs = logsRes.data.timelogs;

      if (!logs || logs.length === 0) {
        return res.status(200).json({
          message: "No time logs found for this user in the last month."
        });
      }
    }

    return res.status(200).json({
      project: { name: matchedProject.name, projectId, userURL },
      user: { email, userId },
      logs
    });

  } catch (err) {
    console.error("Zoho API Error:", err?.response?.data || err.message);
    return res.status(500).json({
      error: "Something went wrong",
      details: err?.response?.data || err.message
    });
  }
};
