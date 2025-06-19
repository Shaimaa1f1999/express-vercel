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

    // فلترة أولى: التاسكات اللي أنت أحد الـ owners فيها
    const userTasks = allTasks.filter(task =>
      task.details?.owners?.some(owner => owner.id === userId)
    );

    // فلترة ثانية: التاسكات اللي حالتها مو Closed
    const notClosedTasks = userTasks.filter(task =>
      task.status?.name.toLowerCase() !== "closed"
    );

    // خذ فقط أسماء التاسكات
    const taskNames = notClosedTasks.map(task => task.name);

    res.status(200).json({
      total: taskNames.length,
      taskNames
    });
  } catch (error) {
    console.error("Zoho fetch error:", error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch or filter tasks." });
  }
}
