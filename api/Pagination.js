import fetch from 'node-fetch';

export default async function handler(req, res) {
  try {
    const { apiUrl, accessToken } = req.body;
    let allData = [];
    let page = 1;
    const limit = 100;

    while (true) {
      const url = `${apiUrl}?page=${page}&per_page=${limit}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Error fetching page ${page}: ${response.statusText}`);
      }

      const data = await response.json();

      if (!Array.isArray(data) || data.length === 0) break;

      allData = allData.concat(data);

      if (data.length < limit) break;

      page++;
    }

    // تحويل ل CSV
    const headers = Object.keys(allData[0]);
    const csv = [
      headers.join(","),
      ...allData.map(row => headers.map(h => `"${(row[h] ?? "").toString().replace(/"/g, '""')}"`).join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=data.csv");
    res.status(200).send(csv);

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
