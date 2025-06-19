const express = require("express");
const axios = require("axios");
const app = express();

app.use(express.json());

app.post("/filter-tasks", async (req, res) => {
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

    // فلترة التاسكات اللي فيها اليوزر
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

    res.json({
      total: filteredTasks.length,
      tasks: filteredTasks
    });
  } catch (err) {
    console.error("Error fetching tasks:", err.message);
    res.status(500).json({ error: "Failed to fetch or filter tasks." });
  }
});

module.exports = app;
