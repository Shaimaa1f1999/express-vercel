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

  // التحقق من القيم الأساسية
  if (!projectId || !taskName || !logDate || !totalHour || !billStatus || !Array.isArray(tasks)) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // التحقق من صيغة التاريخ MM-DD-YYYY (يجي غالباً YYYY-MM-DD فنعكسه)
  const dateParts = logDate.split("-");
  if (dateParts.length !== 3 || dateParts[0].length !== 4) {
    return res.status(400).json({ error: "logDate must be in YYYY-MM-DD format" });
  }
  const [yyyy, mm, dd] = dateParts;
  const formattedDate = `${mm}-${dd}-${yyyy}`;
  if (isNaN(Date.parse(`${yyyy}-${mm}-${dd}`))) {
    return res.status(400).json({ error: "Invalid date provided" });
  }

  // التحقق من صيغة الوقت hh:mm
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(totalHour)) {
    return res.status(400).json({ error: "totalHour must be in hh:mm format (e.g., 01:30)" });
  }

  // التحقق من bill_status
  const billStatusLower = billStatus.toLowerCase();
  if (billStatusLower !== "billable" && billStatusLower !== "non billable") {
    return res.status(400).json({ error: "billStatus must be either 'Billable' or 'Non Billable'" });
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

    // بناء رابط Zoho
    const url = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/tasks/${taskId}/logs/?date=${formattedDate}&owner=${ownerId}&bill_status=${billStatus}&hours=${totalHour}&notes=${encodeURIComponent(note || "")}`;

    return res.status(200).json({ url });
  } catch (err) {
    console.error("Error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
