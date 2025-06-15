export default function handler(req, res) {
  const { userEmail, data } = req.body;

  if (!userEmail || !Array.isArray(data)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  // إذا المستخدم هو Head
  const asHead = data.filter(row => row.Head_Email === userEmail);
  if (asHead.length > 0) {
    return res.status(200).json({
      role: "Head",
      data: asHead
    });
  }

  // إذا المستخدم هو Manager
  const asManager = data.filter(row => row.Manager_Email === userEmail);
  if (asManager.length > 0) {
    return res.status(200).json({
      role: "Manager",
      data: asManager
    });
  }

  // إذا المستخدم مجرد موظف عادي (إيميله في عمود Email)
  const asEmployee = data.filter(row => row.Email === userEmail);
  if (asEmployee.length > 0) {
    return res.status(200).json({
      role: "Employee",
      data: asEmployee
    });
  }

  // إذا ما طلع في أي دور
  return res.status(404).json({ message: "User not found in any role" });
}
