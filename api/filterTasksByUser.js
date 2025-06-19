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

    // تجهيز الإخراج
    const result = openTasks.map(task => ({
      id: task.id_string,
      name: task.name,
      status: task.status?.name,
      timesheetURL: task.link?.timesheet?.url,
      startDate: task.start_date,
      endDate: task.end_date
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
