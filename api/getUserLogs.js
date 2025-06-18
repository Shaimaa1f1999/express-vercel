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

    // تحويل التاريخ من string إلى Date
    const startDateObj = new Date(selectdate);
    const endDateObj = new Date(startDateObj);
    endDateObj.setDate(startDateObj.getDate() + 6); // نضيف 6 أيام

    // نحول التاريخ إلى MM-DD-YYYY
    const formatDate = (date) => {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      const dd = String(date.getDate()).padStart(2, '0');
      const yyyy = date.getFullYear();
      return `${mm}-${dd}-${yyyy}`;
    };

    const startDate = formatDate(startDateObj);
    const endDate = formatDate(endDateObj);

    // نحضر custom_date كـ JSON ونشفره
    const customDateObj = {
      start_date: startDate,
      end_date: endDate
    };
    const encodedCustomDate = encodeURIComponent(JSON.stringify(customDateObj));

    const logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs?users_list=${matchedUser.id}&view_type=custom_date&date=${startDate}&custom_date=${encodedCustomDate}&bill_status=All&component_type=task`;

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
