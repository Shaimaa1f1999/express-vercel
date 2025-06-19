export default function handler(req, res) {
  const { userId, tasks } = req.body;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    // فلترة المهام اللي ownerId فيها يطابق userId
    const matchedTasks = tasks.filter(task =>
      task?.ownerId?.toString() === userId?.toString()
    );

    // استبعاد المهام اللي status.name = "Closed"
    const openTasks = matchedTasks.filter(task =>
      task?.status?.name?.toLowerCase() !== "closed"
    );

    // بناء النتيجة
    const result = openTasks.map(task => ({
      ownerId: task.ownerId,
      name: task.name,
      status: task.status?.name
    }));

    return res.status(200).json({
      total: result.length,
      tasks: result
    });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
