import axios from "axios";

export default async function handler(req, res) {
  const { access_token, tasksURL, userId } = req.body;

  if (!access_token || !tasksURL || !userId) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const response = await axios.get(tasksURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
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
    console.error("Zoho fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch or filter tasks." });
  }
}
