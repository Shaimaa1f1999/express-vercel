import axios from "axios";

export default async function handler(req, res) {
  const { access_token, tasksURL, userId } = req.body;

  if (!access_token || !tasksURL || !userId) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    console.log("Received body:", { access_token, tasksURL, userId });

    const response = await axios.get(tasksURL + "?component_type=task", {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      },
      timeout: 15000 // احتياطاً
    });

    const allTasks = response.data.tasks || [];

    const filteredTasks = allTasks
      .filter(task =>
        task.details?.owners?.some(owner => owner.id === userId)
      )
      .map(task => ({
        id: task.id_string,
        name: task.name,
        status: task.status?.name,
        timesheetURL: task.link?.timesheet?.url,
        startDate: task.start_date,
        endDate: task.end_date
      }));

    res.status(200).json({
      total: filteredTasks.length,
      tasks: filteredTasks
    });
  } catch (error) {
    console.error("Zoho fetch error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch or filter tasks." });
  }
}
