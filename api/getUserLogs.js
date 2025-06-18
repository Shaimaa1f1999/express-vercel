const axios = require("axios");

module.exports = async function handler(req, res) {
  const { email, access_token, userURL, projectId, durationType, selectdate } = req.body;

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

    // نحفظ النوع الأساسي (week أو month)
    const viewTypeRaw = durationType?.toLowerCase();

    // مؤقتًا نغيّره إلى custom لتجربة API
    const viewType = "custom";

    let logsURL = "";

    if (viewType === "custom") {
      const custom_date = `{start_date:${selectdate.start},end_date:${selectdate.end}}`;
      const encoded = encodeURIComponent(custom_date);

      logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs?users_list=${matchedUser.id}&view_type=custom_date&date=${selectdate.start}&custom_date=${encoded}&bill_status=All&component_type=task`;
    } else {
      logsURL = `https://projectsapi.zoho.com/restapi/portal/alnafithait/projects/${projectId}/logs/?users_list=${matchedUser.id}&view_type=${viewType}&date=${selectdate}&bill_status=All&component_type=task`;
    }

    res.json({
      userId: matchedUser.id,
      logsLink: logsURL
    });

  } catch (err) {
    console.error("ERROR", err.message);
    res.status(500).json({ error: "Failed to fetch user or logs." });
  }
};
