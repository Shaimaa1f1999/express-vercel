export default function handler(req, res) {
  const body = req.body.body || req.body;
  const { tasks, userId } = body;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    const result = tasks.reduce((acc, task) => {
      const owners = task?.details?.owners || [];
      const ownerIds = owners
        .filter(owner => owner.id.toString() === userId.toString())
        .map(owner => owner.id);

      if (ownerIds.length > 0 && task.status?.name?.toLowerCase() !== "closed") {
        acc.push({
          name: task.name,
          status: task.status?.name || "Unknown",
          owners: ownerIds,
        });
      }

      return acc;
    }, []);

    return res.status(200).json({ body: result });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
