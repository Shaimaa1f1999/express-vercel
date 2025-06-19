export default function handler(req, res) {
  const { userId, tasks } = req.body;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    // فلترة المهام اللي تحتوي على هذا اليوزر كأحد المالكين
    const filteredTasks = tasks.filter(task =>
      task?.details?.owners?.some(owner => owner?.id?.toString() === userId?.toString())
    );

    // استبعاد المهام اللي status.name فيها "Closed"
    const openTasks = filteredTasks.filter(task =>
      task?.status?.name?.toLowerCase() !== "closed"
    );

    // تجهيز الإخراج حسب اللي تبغاه فقط
    const result = openTasks.map(task => ({
      ownerId: userId,
      id: task.id_string,
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
