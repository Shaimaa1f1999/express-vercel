export default function handler(req, res) {
  const { taskName, tasks } = req.body;

  if (!taskName || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing taskName or tasks list" });
  }

  try {
    const matchedTask = tasks.find(task =>
      task.name?.toLowerCase() === taskName.toLowerCase()
    );

    if (!matchedTask) {
      return res.status(404).json({ error: "Task name not found in tasks list" });
    }

    const taskId = matchedTask.taskId || matchedTask.id_string;

    return res.status(200).json({
      taskId,
      message: `✅ Task ID for "${taskName}" found successfully.`
    });

  } catch (error) {
    console.error("Error:", error.message);
    return res.status(500).json({ error: "Internal server error" });
  }
}
