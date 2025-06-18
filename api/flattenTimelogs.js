export default function handler(req, res) {
  const input = req.body;
  const timelogDates = input?.timelogs?.date || [];
  const result = [];

  const startDate = new Date(input?.selectdate);
  let current = new Date(startDate);
  let count = 0;
  let endDate = new Date(current);

  // نحسب فقط 5 أيام عمل (نتجاوز الجمعة والسبت)
  while (count < 5) {
    const day = current.getDay();
    if (day !== 5 && day !== 6) {
      count++;
      endDate = new Date(current);
    }
    current.setDate(current.getDate() + 1);
  }

  timelogDates.forEach(day => {
    const [month, dayNum, year] = day.date.split("-");
    const isoDateString = `${year}-${month}-${dayNum}`;
    const dateObj = new Date(isoDateString);
    const dayOfWeek = dateObj.getDay();

    if (dateObj < startDate || dateObj > endDate || dayOfWeek === 5 || dayOfWeek === 6) return;

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
