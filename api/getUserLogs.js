const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId, selectdate } = req.body;

  try {
    const usersRes = await axios.get(userURL, {
      headers: {
        Authorization: `Zoho-oauthtoken ${access_token}`
      }
    });

    const matchedUser = usersRes.data.users.find(
      u => u.email?.toLowerCase() === email.toLowerCase()
    );

    if (!matchedUser) {
      return res.status(404).json({ error: "User not found in this project" });
    }

    // نحسب نهاية الأسبوع: start + 6 أيام
    const startDate = new Date(selectdate);
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6);

    // نحولها لصيغة MM-DD-YYYY
    const formatDate = (d) => {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      const yyyy = d.getFullYear();
      return `${mm}-${dd}-${yyyy}`;
    };

    const start = formatDate(startDate);
    const end = formatDate(endDate);

    const customDateJSON = {
      start_date: start,
      end_date: end
    };

    const encodedCustomDate = encodeURIComponent(JSON.stringify(customDateJSON));

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs?users_list=${matchedUser.id}&view_type=custom_date&date=${start}&custom_date=${encodedCustomDate}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
