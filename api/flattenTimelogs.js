export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];

  const result = [];

  const startDate = new Date(input?.selectdate + "T00:00:00");

  timelogDates.forEach(day => {
    if (!day?.date) return;

    const [mm, dd, yyyy] = day.date.split("-");
    const isoDateString = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const dateObj = new Date(isoDateString + "T00:00:00");

    // نعرض فقط التواريخ من startDate وطالع
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
