export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];

  const result = [];

  // ✅ نستخدم التاريخ اللي اختاره المستخدم كـ بداية فقط
  const startDate = new Date(input?.selectdate); // مثل 2025-06-17

  timelogDates.forEach(day => {
    const [month, dayNum, year] = day.date.split("-");
    const isoDateString = `${year}-${month}-${dayNum}`;
    const dateObj = new Date(isoDateString);

    // ✅ رجّع فقط التواريخ اللي >= startDate
    if (dateObj < startDate) return;

    const total_hours = day.total_hours;

    (day.tasklogs || []).forEach(log => {
      result.push({
        date: isoDateString,
        name: log?.task?.name || '',
        total_hours,
        approval_status: log?.approval_status || ''
      });
    });
  });

  result.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.status(200).json(result);
}
