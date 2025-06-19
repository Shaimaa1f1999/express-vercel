export default function handler(req, res) {
  const { userId, tasks } = req.body;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    // فلترة المهام بناءً على وجود اليوزر ضمن الـ owners
    const matchedTasks = tasks.filter(task => {
      const owners = task?.details?.owners || [];
      const isOwner = owners.some(owner => owner?.id?.toString() === userId.toString());
      const isNotClosed = task?.status?.toLowerCase() !== "closed";
      return isOwner && isNotClosed;
    });

    const result = matchedTasks.map(task => ({
      taskId: task.id,
      name: task.name,
      status: task.status,
      matchedOwnerId: userId // ترجع فقط اليوزر الحالي
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
