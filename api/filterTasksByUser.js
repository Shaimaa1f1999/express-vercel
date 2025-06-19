export default function handler(req, res) {
  const { userId, tasks } = req.body;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    const filteredTasks = tasks.filter(task => {
      const owners = task?.details?.owners || [];
      const hasUser = owners.some(owner => owner?.id?.toString() === userId.toString());
      const isOpen = task?.status?.name?.toLowerCase() !== "closed";
      return hasUser && isOpen;
    });

    const result = filteredTasks.map(task => ({
      taskId: task.id, // لو عندك ID داخله
      ownerId: userId,
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
