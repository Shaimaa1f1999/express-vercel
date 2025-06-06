export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs || [];

  const result = [];

  // التاريخ اللي تبغى تبدأ منه (يكون بصيغة yyyy-MM-dd)
  const startDate = "2025-06-02";

  timelogDates.forEach(day => {
    const date = day.date;

    // تجاهل أي يوم أقل من startDate
    if (date < startDate) return;

    const total_hours = day.total_hours;

    (day.tasklogs || []).forEach(log => {
      result.push({
        date,
        name: log?.task?.name || '',
        total_hours,
        approval_status: log?.approval_status || ''
      });
    });
  });

  // ترتيب النتائج حسب التاريخ
  result.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.status(200).json(result);
}
