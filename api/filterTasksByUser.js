export default function handler(req, res) {
const body = req.body.body || req.body; // يتأكد من nesting
const { tasks } = body;
const userId = req.query.userId;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    const matchedTasks = tasks
      .map(task => {
        const owners = task?.details?.owners || [];
        const matchedOwner = owners.find(owner => owner.id.toString() === userId.toString());

        if (matchedOwner) {
          return {
            id: matchedOwner.id,
            name: task.name,
            status: task.status?.name || "Unknown"
          };
        }

        return null;
      })
      .filter(task => task !== null);

    return res.status(200).json({ body: matchedTasks });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
