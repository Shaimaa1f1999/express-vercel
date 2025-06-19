import axios from "axios";

export async function fetchTasksFromZoho(tasksURL, access_token) {
  const response = await axios.get(tasksURL, {
    headers: {
      Authorization: `Zoho-oauthtoken ${access_token}`
    }
  });

  return response.data.tasks || [];
}
