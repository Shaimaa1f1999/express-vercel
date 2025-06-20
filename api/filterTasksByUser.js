export default function handler(req, res) {
  const body = req.body.body || req.body;
  const { tasks, userId } = body;

  if (!userId || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing userId or tasks array" });
  }

  try {
    const userIdStr = userId.toString(); // نحفظه مرة واحدة بدل ما نعيد التكرار

    const result = tasks.reduce((acc, task) => {
      const owners = task?.details?.owners || [];

      // نوقف أول ما نلاقي match، ما نكمل تمشي على الباقين
      const ownerMatch = owners.find(owner => owner.id?.toString() === userIdStr);

      if (ownerMatch && task.status?.name?.toLowerCase() !== "closed") {
        acc.push({
          name: task.name,
          status: task.status?.name || "Unknown",
          ownerId: ownerMatch.id,
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
