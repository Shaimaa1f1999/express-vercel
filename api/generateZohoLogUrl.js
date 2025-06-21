export default function handler(req, res) {
  const {
    projectId,
    taskName,
    logDate,
    totalHour,
    note,
    billStatus,
    tasks
  } = req.body;

  // التحقق من القيم الأساسية فقط
  if (!projectId || !taskName || !logDate || !totalHour || !billStatus || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // البحث عن التاسك بالاسم (case-insensitive)
    const matchedTask = tasks.find(task =>
      task.name?.toLowerCase() === taskName.toLowerCase()
    );

    if (!matchedTask) {
      return res.status(404).json({ error: "Task name not found in tasks list" });
    }

    // استخراج القيم المطلوبة
    const taskId = matchedTask.id_string;
    const ownerId = matchedTask.ownerId || matchedTask.details?.owners?.[0]?.id;

    if (!ownerId) {
      return res.status(400).json({ error: "ownerId not found in matched task" });
    }

    // بناء رابط Zoho بصيغة مباشرة بدون تحويل التاريخ
    const url = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/tasks/${taskId}/logs/?date=${logDate}&owner=${ownerId}&bill_status=${billStatus}&hours=${totalHour}&notes=${encodeURIComponent(note || "")}`;

    return res.status(200).json({ url });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
